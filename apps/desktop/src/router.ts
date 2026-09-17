import { createRouter, createWebHashHistory } from "vue-router";
import LibraryView from "./views/LibraryView.vue";
import EnhanceView from "./views/EnhanceView.vue";
import EditorView from "./views/EditorView.vue";
import BookView from "./views/BookView.vue";
import PrintView from "./views/PrintView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "library", component: LibraryView },
    { path: "/enhance", name: "enhance", component: EnhanceView },
    { path: "/editor", name: "editor", component: EditorView },
    { path: "/book", name: "book", component: BookView },
    { path: "/print", name: "print", component: PrintView },
  ],
});
