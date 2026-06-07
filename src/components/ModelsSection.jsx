import { useState } from "react";
import ModelConfig from "./ModelConfig.jsx";
import ModelsOverview from "./ModelsOverview.jsx";
import ModelSpeedCheck from "./ModelSpeedCheck.jsx";

export default function ModelsSection({ activeModel, onChanged, tab, onTab }) {
  const [localSub, setLocalSub] = useState("config");
  const sub = tab || localSub;
  const go = (t) => { if (onTab) onTab(t); else setLocalSub(t); };
  return (
    <div className="models-section">
      <div className="ms-body">
        {sub === "config" ? <ModelConfig onChanged={onChanged} />
          : sub === "overview" ? <ModelsOverview activeModel={activeModel} />
          : <ModelSpeedCheck />}
      </div>
    </div>
  );
}
