import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HappyOysterApp } from "./app/HappyOysterApp";
import "./app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HappyOysterApp />
  </StrictMode>,
);
