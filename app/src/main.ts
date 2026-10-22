import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles.css'
import { locale } from './i18n'

document.documentElement.lang = locale.value

createApp(App).use(createPinia()).mount('#app')
