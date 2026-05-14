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

// Clé unique d'une association pour le merge
function assocKey(a) {
  if (a.texteId && a.imageId) return 'ti:' + a.texteId + ':' + a.imageId;
  if (a.calculId && a.chiffreId) return 'cn:' + a.calculId + ':' + a.chiffreId;
  return 'idx:' + (a.id || JSON.stringify(a));
}

// Fusionne les modifications utilisateur (themes, levelClass) du cache dans les données statiques
function mergeUserEdits(staticData, cached) {
  if (!cached || !cached.associations) return staticData;
  
  // Index des associations en cache par clé
  const cacheIndex = new Map();
  (cached.associations || []).forEach(a => cacheIndex.set(assocKey(a), a));
  
  // Partir de la base statique et appliquer UNIQUEMENT les modifications user-only
  // (localNameOverrides). Les themes et levelClass viennent TOUJOURS du fichier statique
  // quand la version statique est plus récente, car les modifications de themes/level
  // sont faites par le développeur, pas l'utilisateur final.
  const merged = { ...staticData };
  merged.associations = (staticData.associations || []).map(sa => {
    const key = assocKey(sa);
    const ca = cacheIndex.get(key);
    if (!ca) return sa; // pas de version en cache, garder la statique
    
    // Seuls les localNameOverrides sont des modifications utilisateur à préserver
    const hasUserLocalNames = ca.localNameOverrides && Object.keys(ca.localNameOverrides).length > 0;
    
    if (hasUserLocalNames) {
      return { ...sa, localNameOverrides: ca.localNameOverrides };
    }
    return sa;
  });
  
  // Ajouter les associations du cache qui n'existent pas dans le statique (ajouts utilisateur)
  const staticKeys = new Set(merged.associations.map(assocKey));
  const userAdded = (cached.associations || []).filter(a => !staticKeys.has(assocKey(a)));
  if (userAdded.length > 0) {
    merged.associations = [...merged.associations, ...userAdded];
    console.log('[DataContext] Preserved ' + userAdded.length + ' user-added associations');
  }
  
  // Pour textes/images/calculs/chiffres : toujours utiliser les données statiques
  // quand la version statique est plus récente (pas de modifications utilisateur à préserver)
  
  merged._dataVersion = staticData._dataVersion || 0;
  return merged;
}

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [data, setDataRaw] = useState(null);
  const skipPersist = useRef(false);

  // Charger le JSON au démarrage: fusionner statique + modifications localStorage
  useEffect(() => {
    const empty = { textes: [], images: [], calculs: [], chiffres: [], associations: [] };
    fetch(process.env.PUBLIC_URL + "/data/associations.json")
      .then(res => res.json())
      .then(staticData => {
        const cached = loadFromLocalStorage();
        const staticVer = staticData?._dataVersion || 0;
        const cachedVer = cached?._dataVersion || 0;

        if (cached && cachedVer >= staticVer) {
          // localStorage est à jour ou plus récent
          console.log('[DataContext] Loaded from localStorage (v' + cachedVer + ')');
          skipPersist.current = true;
          setDataRaw(cached);
          skipPersist.current = false;
        } else if (cached) {
          // Nouvelle version statique → FUSIONNER avec les modifications utilisateur
          console.log('[DataContext] Merging static (v' + staticVer + ') with user edits from localStorage (v' + cachedVer + ')');
          const merged = mergeUserEdits(staticData, cached);
          skipPersist.current = true;
          setDataRaw(merged);
          skipPersist.current = false;
          saveToLocalStorage(merged);
        } else {
          // Première visite, pas de cache
          console.log('[DataContext] First load from static file (v' + staticVer + ')');
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