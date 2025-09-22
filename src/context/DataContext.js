import React, { createContext, useState, useEffect } from "react";

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [data, setData] = useState(null);

  // Charger le JSON au démarrage
  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/data/associations.json")
      .then(res => res.json())
      .then(setData)
      .catch(() => setData({
        textes: [], images: [], calculs: [], chiffres: [], associations: []
      }));
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