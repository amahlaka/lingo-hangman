import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SettingsProvider } from "./app/SettingsContext";
import { ProgressProvider } from "./app/ProgressContext";
import { FeedbackProvider } from "./app/FeedbackContext";
import Home from "./app/Home";
import Profile from "./app/Profile";
import Preferences from "./app/Preferences";
import Shop from "./app/Shop";
import Account from "./app/Account";
import Leaderboard from "./app/Leaderboard";
import Privacy from "./app/Privacy";
import Suggest from "./app/Suggest";
import AdminReports from "./admin/AdminReports";
import ContentAdmin from "./admin/ContentAdmin";
import AdminUsers from "./admin/AdminUsers";
import AdminStats from "./admin/AdminStats";
import AdminLearner from "./admin/AdminLearner";
import HearSentence from "./app/HearSentence";
import { TrackedGame } from "./app/PlayTracking";
import { GAMES, PLAYABLE_GAME_IDS } from "./games/registry";

// Providers and routes, without the router, so tests can wrap it in a MemoryRouter.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/preferences" element={<Preferences />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/shop" element={<Shop />} />
      <Route path="/account" element={<Account />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/suggest" element={<Suggest />} />
      <Route path="/hear" element={<HearSentence />} />
      {/* Word bank editor; not linked from the app, see the lingo-wordbase README. */}
      <Route path="/admin" element={<ContentAdmin />} />
      <Route path="/admin/reports" element={<AdminReports />} />
      <Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/stats" element={<AdminStats />} />
      <Route path="/admin/users/:id" element={<AdminLearner />} />
      {GAMES.flatMap((game) =>
        (game.routes || []).map(({ path, Component }) => (
          <Route key={path} path={path} element={<TrackedGame id={game.id}><Component /></TrackedGame>} />
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
        <FeedbackProvider>{children}</FeedbackProvider>
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
