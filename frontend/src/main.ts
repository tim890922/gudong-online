import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
import HomeView from './views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/r/:code([A-Za-z0-9]{4})', component: () => import('./views/RoomView.vue') },
    { path: '/rules', component: () => import('./views/RulesView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

createApp(App).use(createPinia()).use(router).mount('#app')
