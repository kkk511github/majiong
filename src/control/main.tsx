import React from "react";
import { createRoot } from "react-dom/client";
import { ControlApp } from "./ControlApp";
import "./control.css";

createRoot(document.getElementById("control-root")!).render(
  <React.StrictMode>
    <ControlApp />
  </React.StrictMode>,
);
