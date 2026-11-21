import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import AppSettings


@pytest.fixture
def settings(tmp_path):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>spa</html>")
    (static / "app.js").write_text("console.log(1)")
    return AppSettings(public_base_url="https://game.example.com", data_dir=tmp_path / "data",
                       static_dir=static, room_ttl_hours=12)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def create(client, name="房主"):
    r = client.post("/api/rooms", json={"name": name})
    assert r.status_code == 200
    return r.json()


def join(client, code, name):
    return client.post(f"/api/rooms/{code}/join", json={"name": name})


def recv_state(ws):
    while True:
        msg = json.loads(ws.receive_text())
        if msg["type"] == "state":
            return msg["view"]
        if msg["type"] in ("error", "removed"):
            return msg


def test_config_and_health(client):
    assert client.get("/api/health").json() == {"ok": True}
    assert client.get("/api/config").json()["public_base_url"] == "https://game.example.com"


def test_meta(client):
    meta = client.get("/api/meta").json()
    assert meta["zodiac"][0] == "鼠"
    assert meta["roles"]["xu_yuan"]["name"] == "許願"
    assert meta["roles"]["big_eye"]["replaces"] == "ji_yunfu"


def test_create_and_join_room(client):
    host = create(client)
    code = host["code"]
    assert len(code) == 4
    summary = client.get(f"/api/rooms/{code.lower()}").json()
    assert summary["exists"] and summary["joinable"] and summary["players"] == 1
    r = join(client, code, "  阿明 ")
    assert r.status_code == 200
    assert client.get("/api/rooms/ZZZZ").json()["exists"] is False
    assert join(client, "ZZZZ", "x").status_code == 404
    assert join(client, code, "   ").status_code == 422


def test_room_full(client):
    code = create(client)["code"]
    for i in range(7):
        assert join(client, code, f"p{i}").status_code == 200
    r = join(client, code, "第九人")
    assert r.status_code == 409 and "已滿" in r.json()["detail"]


def test_websocket_flow_and_private_views(client):
    host = create(client)
    code = host["code"]
    others = [join(client, code, f"玩家{i}").json() for i in range(5)]
    sockets = []
    with client.websocket_connect(f"/ws/{code}?token={host['token']}") as hws:
        view = recv_state(hws)
        assert view["phase"] == "lobby" and view["me"] == host["player_id"]
        for cred in others:
            ws = client.websocket_connect(f"/ws/{code}?token={cred['token']}")
            sockets.append(ws.__enter__())
        hws.send_text(json.dumps({"type": "ping"}))
        assert json.loads(hws.receive_text())["type"] in ("pong", "state")

        # 非房主不能開始
        sockets[0].send_text(json.dumps({"type": "action", "action": {"type": "start_game"}}))
        msg = None
        while msg is None or msg["type"] == "state":
            msg = json.loads(sockets[0].receive_text())
        assert msg["type"] == "error" and "房主" in msg["message"]

        hws.send_text(json.dumps({"type": "action", "action": {"type": "start_game"}}))
        view = recv_state(hws)
        while view.get("phase") != "roles":
            view = recv_state(hws)
        my_role = view["game"]["me"]["role"]
        assert my_role is not None
        raw = json.dumps(view)
        assert "genuine" not in raw and "token" not in raw
        for ws in sockets:
            ws.__exit__(None, None, None)


def test_bad_token_is_rejected(client):
    code = create(client)["code"]
    with client.websocket_connect(f"/ws/{code}?token=nope") as ws:
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "removed"


def recv_until(ws, pred):
    while True:
        msg = json.loads(ws.receive_text())
        if pred(msg):
            return msg


def test_remote_room_chat(client):
    host = create(client)
    code = host["code"]
    guest = join(client, code, "路人").json()

    def say(ws, text):
        ws.send_text(json.dumps({"type": "chat", "text": text}))

    def error(ws):
        return recv_until(ws, lambda m: m["type"] == "error")["message"]

    def chat(ws):
        return recv_until(ws, lambda m: m["type"] == "chat")["message"]

    with client.websocket_connect(f"/ws/{code}?token={host['token']}") as hws, \
            client.websocket_connect(f"/ws/{code}?token={guest['token']}") as gws:
        # 面對面的房間沒有聊天室
        say(gws, "哈囉")
        assert "沒有開放" in error(gws)

        hws.send_text(json.dumps({"type": "action", "action": {
            "type": "update_settings", "settings": {"remote": True}}}))
        recv_until(gws, lambda m: m["type"] == "state" and m["view"]["settings"]["remote"])
        say(gws, "  大家\n好‮  ")
        msg = chat(hws)
        assert (msg["id"], msg["player_id"], msg["name"], msg["text"]) == (
            1, guest["player_id"], "路人", "大家 好")
        assert chat(gws)["id"] == 1

        say(gws, "   ")
        assert "空白" in error(gws)
        say(gws, "字" * 201)
        assert "200" in error(gws)
        say(gws, 42)
        assert "空白" in error(gws)

        # 洗版：10 秒內最多 5 則
        for i in range(4):
            say(gws, f"第{i}則")
        say(gws, "第五則")
        assert "太頻繁" in error(gws)

        # 重新連線時補上紀錄
        with client.websocket_connect(f"/ws/{code}?token={guest['token']}") as again:
            history = recv_until(again, lambda m: m["type"] == "chat_history")["messages"]
            assert [m["text"] for m in history] == ["大家 好", "第0則", "第1則", "第2則", "第3則"]

        # 房主關掉聊天室
        hws.send_text(json.dumps({"type": "action", "action": {
            "type": "set_chat", "enabled": False}}))
        recv_until(hws, lambda m: m["type"] == "state" and m["view"]["settings"]["chat"] is False)
        say(hws, "還在嗎")
        assert "沒有開放" in error(hws)


def test_room_survives_restart(settings):
    with TestClient(create_app(settings)) as c1:
        host = create(c1)
        join(c1, host["code"], "第二人")
    with TestClient(create_app(settings)) as c2:
        summary = c2.get(f"/api/rooms/{host['code']}").json()
        assert summary["exists"] and summary["players"] == 2
        with c2.websocket_connect(f"/ws/{host['code']}?token={host['token']}") as ws:
            assert recv_state(ws)["me"] == host["player_id"]


def test_spa_fallback(client):
    assert client.get("/app.js").text == "console.log(1)"
    assert "spa" in client.get("/r/ABCD").text
    assert client.get("/api/nothing").status_code == 404
    assert client.get("/../../etc/passwd").status_code in (200, 404)
    assert "root:" not in client.get("/..%2F..%2Fetc%2Fpasswd").text
