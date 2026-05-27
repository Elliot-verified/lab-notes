import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import HomePage from "./pages/HomePage";
import RunPage from "./pages/RunPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="/runs/:runId" element={<RunPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
