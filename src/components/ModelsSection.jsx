import { useState } from "react";
import ModelConfig from "./ModelConfig.jsx";
import ModelsOverview from "./ModelsOverview.jsx";
import ModelSpeedCheck from "./ModelSpeedCheck.jsx";

export default function ModelsSection({ activeModel, onChanged }) {
  const [sub, setSub] = useState("config");
  return (
    <div className="models-section">
      <div className="ms-subtabs">
        <button className={`ms-subtab ${sub === "config" ? "on" : ""}`} onClick={() => setSub("config")}>Model configuration</button>
        <button className={`ms-subtab ${sub === "overview" ? "on" : ""}`} onClick={() => setSub("overview")}>Models overview</button>
        <button className={`ms-subtab ${sub === "speed" ? "on" : ""}`} onClick={() => setSub("speed")}>Models speed check</button>
      </div