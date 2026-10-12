import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, AppRoutes } from "./App";

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

// Render the whole app at `path` with in-memory progress storage.
export function renderApp(path = "/", { storage = memoryStorage(), lang = "en" } = {}) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders storage={storage} initialLang={lang}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>
  );
  return { ...result, storage };
}
