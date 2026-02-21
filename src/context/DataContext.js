import React, { createContext, useState, useEffect, useCallback, useRef } from "react";

const LS_KEY = 'cc_data_cache';

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveToLocalStorage(d) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch (e) {
    console.warn('[DataContext] localStorage save failed:', e);
  }
}

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [data, setDataRaw] = useState(null);
  const skipPersist = useRef(false);

  // Charger le JSON au démarrage: comparer version statique vs localStorage
  useEffect(() => {
    const empty = { textes: [], images: [], calculs: [], chiffres: [], associations: [] };
    fetch(process.env.PUBLIC_URL + "/data/associations.json")
      .then(res => res.json())
      .then(staticData => {
        const cached = loadFromLocalStorage();
        const staticVer = staticData?._dataVersion || 0;
        const cachedVer = cached?._dataVersion || 0;

        if (cached && cachedVer >= staticVer) {
          // localStorage a des modifications plus récentes ou identiques
          console.log('[DataContext] Loaded from localStorage (v' + cachedVer + ')');
          skipPersist.current = true;
          setDataRaw(cached);
          skipPersist.current = false;
        } else {
          // Nouveau déploiement avec version supérieure → utiliser le fichier statique
          console.log('[DataContext] Loaded from static file (v' + staticVer + ')');
          skipPersist.current = true;
          setDataRaw(staticData);
          skipPersist.current = false;
          saveToLocalStorage(staticData);
        }
      })
      .catch(() => {
        const cached = loadFromLocalStorage();
        if (cached) {
          skipPersist.current = true;
          setDataRaw(cached);
          skipPersist.current = false;
        } else {
          setDataRaw(empty);
        }
      });
  }, []);

  // Wrapper setData qui persiste automatiquement dans localStorage
  const setData = useCallback((updater) => {
    setDataRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next && !skipPersist.current) {
        saveToLocalStorage(next);
      }
      return next;
    });
  }, []);

  // Méthode pour remplacer tout le JSON (upload)
  const importJson = (jsonData) => setData(jsonData);

  // Méthode pour télécharger le JSON actuel
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "associations.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DataContext.Provider value={{ data, setData, importJson, downloadJson }}>
      {children}
    </DataContext.Provider>
  );
};
export default DataProvider;