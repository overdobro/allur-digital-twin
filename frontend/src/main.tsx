import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./lib/context";
import { TourProvider } from "./components/Tour";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider>
        <TourProvider>
          <App />
        </TourProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
