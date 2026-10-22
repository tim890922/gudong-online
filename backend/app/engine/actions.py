from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .models import Settings
from .roles import Role


class SetProfile(BaseModel):
    type: Literal["set_profile"]
    name: str | None = Field(default=None, min_length=1, max_length=12)
    color: int | None = None


class UpdateSettings(BaseModel):
    type: Literal["update_settings"]
    settings: Settings


class Kick(BaseModel):
    type: Literal["kick"]
    player_id: str


class TransferHost(BaseModel):
    type: Literal["transfer_host"]
    player_id: str


class Leave(BaseModel):
    type: Literal["leave"]


class StartGame(BaseModel):
    type: Literal["start_game"]


class PickRole(BaseModel):
    type: Literal["pick_role"]
    role: Role


class Ready(BaseModel):
    type: Literal["ready"]


class IdentifyHead(BaseModel):
    type: Literal["identify_head"]
    pos: int


class IdentifyPlayer(BaseModel):
    type: Literal["identify_player"]
    target: str


class Advance(BaseModel):
    type: Literal["advance"]


class UseSkill(BaseModel):
    type: Literal["use_skill"]
    kind: Literal["ambush", "poison", "block", "swap", "none"]
    target: str | None = None
    pos: int | None = None
    swap: bool | None = None


class PassTo(BaseModel):
    type: Literal["pass_to"]
    target: str | None = None


class StartVoting(BaseModel):
    type: Literal["start_voting"]


class SubmitHostVotes(BaseModel):
    type: Literal["submit_host_votes"]
    votes: list[int]


class SubmitChips(BaseModel):
    type: Literal["submit_chips"]
    alloc: list[int]


class NextRound(BaseModel):
    type: Literal["next_round"]


class PeopleVote(BaseModel):
    type: Literal["people_vote"]
    target: str


class PlayAgain(BaseModel):
    type: Literal["play_again"]


class AbortGame(BaseModel):
    type: Literal["abort_game"]


Action = Annotated[
    SetProfile
    | UpdateSettings
    | Kick
    | TransferHost
    | Leave
    | StartGame
    | PickRole
    | Ready
    | IdentifyHead
    | IdentifyPlayer
    | Advance
    | UseSkill
    | PassTo
    | StartVoting
    | SubmitHostVotes
    | SubmitChips
    | NextRound
    | PeopleVote
    | PlayAgain
    | AbortGame,
    Field(discriminator="type"),
]
