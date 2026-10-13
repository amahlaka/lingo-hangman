import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SettingsProvider } from "./app/SettingsContext";
import { ProgressProvider } from "./app/ProgressContext";
import Home from "./app/Home";
import Preferences from "./app/Preferences";
import ContentAdmin from "./admin/ContentAdmin";
import { GAMES, PLAYABLE_GAME_IDS } from "./games/registry";

// Providers and routes, without the router, so tests can wrap it in a MemoryRouter.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/preferences" element={<Preferences />} />
      {/* Word bank editor; not linked from the app, see the lingo-wordbase README. */}
      <Route path="/admin" element={<ContentAdmin />} />
      {GAMES.flatMap((game) =>
        (game.routes || []).map(({ path, Component }) => (
          <Route key={path} path={path} element={<Component />} />
        ))
      )}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export function AppProviders({ children, storage, initialLang }) {
  return (
    <SettingsProvider initialLang={initialLang}>
      <ProgressProvider storage={storage} gameIds={PLAYABLE_GAME_IDS}>
        {children}
      </ProgressProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}
