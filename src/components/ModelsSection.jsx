import { useState } from "react";
import ModelConfig from "./ModelConfig.jsx";
import ModelsOverview from "./ModelsOverview.jsx";
import ModelSpeedCheck from "./ModelSpeedCheck.jsx";
import ModelRouting from "./ModelRouting.jsx";
import LocalModels from "./LocalModels.jsx";

export default function ModelsSection({ activeModel, onChanged, onRefresh, onActivate, activeValue, tab, onTab }) {
  const [localSub, setLocalSub] = useState("config");
  const sub = tab || localSub;
  const go = (t) => { if (onTab) onTab(t); else setLocalSub(t); };
  return (
    <div className="models-section">
      <div className="ms-body">
        {sub === "config" ? <ModelConfig onChanged={onChanged} />
          : sub === "overview" ? <ModelsOverview activeModel={activeModel} />
          : sub === "routing" ? <ModelRouting onChanged={onChanged} />
          : sub === "local" ? <LocalModels onChanged={onChanged} onRefresh={onRefresh} onActivate={onActivate} activeValue={activeValue} />
          : <ModelSpeedCheck />}
      </div>
    </div>
  );
}
