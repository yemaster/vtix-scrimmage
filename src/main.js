import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'

import './style.css'
import App from './App.vue'

// 通用字体
import 'vfonts/Lato.css'
// 等宽字体
import 'vfonts/FiraCode.css'

// Pinia
const pinia = createPinia()

// Route
const routes = [
    { path: '/', name: 'Home', component: () => import("@/pages/Home.vue") }
]

const router = createRouter({
    history: createWebHistory(),
    routes,
})

createApp(App)
    .use(router)
    .use(pinia)
    .mount('#app')
