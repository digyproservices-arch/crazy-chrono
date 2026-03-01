import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const CC = {
  teal: '#1AACBE',
  tealDark: '#148A9C',
  tealDeep: '#0D6A7A',
  brown: '#4A3728',
  white: '#FFFFFF',
};

const TABS = [
  { id: 'mentions', label: 'Mentions légales' },
  { id: 'confidentialite', label: 'Politique de confidentialité' },
  { id: 'cgu', label: 'CGU / CGV' },
];

export default function LegalPages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'mentions';
  const [activeTab, setActiveTab] = useState(TABS.find(t => t.id === initialTab) ? initialTab : 'mentions');

  const switchTab = (id) => {
    setActiveTab(id);
    setSearchParams({ tab: id });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${CC.tealDeep}, ${CC.teal})`,
        color: CC.white, textAlign: 'center', padding: '32px 20px 20px',
      }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Informations légales</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              style={{
                padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                background: activeTab === t.id ? CC.white : 'rgba(255,255,255,0.15)',
                color: activeTab === t.id ? CC.tealDeep : 'rgba(255,255,255,0.85)',
                transition: 'all 0.2s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px 60px' }}>
        {activeTab === 'mentions' && <MentionsLegales />}
        {activeTab === 'confidentialite' && <PolitiqueConfidentialite />}
        {activeTab === 'cgu' && <CGU />}
      </div>
    </div>
  );
}

// ===== MENTIONS LÉGALES =====
function MentionsLegales() {
  return (
    <div style={contentStyle}>
      <h2 style={h2Style}>Mentions légales</h2>
      <p style={metaStyle}>Dernière mise à jour : 1er mars 2026</p>

      <Section title="1. Présentation du site">
        <p><strong>Nom du site :</strong> Crazy Chrono</p>
        <p><strong>URL :</strong> <a href="https://app.crazy-chrono.com" style={linkStyle}>https://app.crazy-chrono.com</a></p>
        <p><strong>Nature :</strong> Application web éducative destinée aux élèves du primaire (CE1–CM2)</p>
      </Section>

      <Section title="2. Éditeur">
        <p><strong>Propriétaire :</strong> Mr VERIN MARIUS</p>
        <p><strong>Siège social :</strong> Chemin de ravine Houël, Castel Lamentin 97129</p>
        <p><strong>Email :</strong> <a href="mailto:crazy.chrono.contact@gmail.com" style={linkStyle}>crazy.chrono.contact@gmail.com</a></p>
        <p><strong>SIREN :</strong> 883 042 277 00029</p>
        <p><strong>Directeur de la publication :</strong> Mr VERIN MARIUS</p>
      </Section>

      <Section title="3. Conception et réalisation">
        <p><strong>Conception / Création / Réalisation :</strong> Ruling Place TM</p>
      </Section>

      <Section title="4. Hébergement">
        <p><strong>Frontend :</strong> Vercel Inc. — 440 N Barranca Ave #4133, Covina, CA 91723, USA — <a href="https://vercel.com" style={linkStyle}>vercel.com</a></p>
        <p><strong>Backend :</strong> Render Services Inc. — 525 Brannan St, Suite 300, San Francisco, CA 94107, USA — <a href="https://render.com" style={linkStyle}>render.com</a></p>
        <p><strong>Base de données :</strong> Supabase Inc. — 970 Toa Payoh North, #07-04, Singapore 318992 — <a href="https://supabase.com" style={linkStyle}>supabase.com</a></p>
      </Section>

      <Section title="5. Propriété intellectuelle">
        <p>L'ensemble du contenu du site (textes, images, graphismes, logo, icônes, sons, jeux, données éducatives, logiciels) est la propriété exclusive de Mr VERIN MARIUS ou de ses partenaires et est protégé par les lois françaises et internationales relatives à la propriété intellectuelle.</p>
        <p>Toute reproduction, représentation, modification, publication, adaptation de tout ou partie des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite sauf autorisation écrite préalable.</p>
      </Section>

      <Section title="6. Données personnelles">
        <p>Les données personnelles collectées sur ce site sont traitées conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés du 6 janvier 1978 modifiée.</p>
        <p>Pour plus de détails, consultez notre <button onClick={() => {}} style={{...linkStyle, background:'none', border:'none', cursor:'pointer', padding:0, fontSize:'inherit'}}>Politique de confidentialité</button>.</p>
      </Section>

      <Section title="7. Droit applicable">
        <p>Les présentes mentions légales sont soumises au droit français. En cas de litige, les tribunaux de Fort-de-France (Martinique) seront seuls compétents.</p>
      </Section>
    </div>
  );
}

// ===== POLITIQUE DE CONFIDENTIALITÉ =====
function PolitiqueConfidentialite() {
  return (
    <div style={contentStyle}>
      <h2 style={h2Style}>Politique de confidentialité</h2>
      <p style={metaStyle}>Dernière mise à jour : 1er mars 2026</p>

      <Section title="1. Responsable du traitement">
        <p><strong>Mr VERIN MARIUS</strong></p>
        <p>Chemin de ravine Houël, Castel Lamentin 97129</p>
        <p>Email : <a href="mailto:crazy.chrono.contact@gmail.com" style={linkStyle}>crazy.chrono.contact@gmail.com</a></p>
      </Section>

      <Section title="2. Données collectées">
        <p>Nous collectons les données suivantes, selon le type de compte :</p>

        <h4 style={h4Style}>Comptes parents / enseignants</h4>
        <ul style={listStyle}>
          <li>Adresse email (pour l'authentification)</li>
          <li>Nom et prénom (pour la personnalisation)</li>
          <li>Mot de passe (stocké sous forme hashée, jamais en clair)</li>
          <li>Données d'abonnement (type de plan, dates, statut — via Stripe)</li>
        </ul>

        <h4 style={h4Style}>Comptes élèves (mineurs)</h4>
        <ul style={listStyle}>
          <li>Prénom et nom (fournis par l'établissement scolaire)</li>
          <li>Classe et école de rattachement</li>
          <li>Code d'accès (généré automatiquement)</li>
          <li>Avatar (optionnel)</li>
        </ul>

        <h4 style={h4Style}>Données de jeu (tous les comptes)</h4>
        <ul style={listStyle}>
          <li>Sessions de jeu (mode, thèmes, durée)</li>
          <li>Tentatives et résultats (scores, temps de réponse)</li>
          <li>Résultats d'entraînement (progression pédagogique)</li>
        </ul>
      </Section>

      <Section title="3. Finalités du traitement">
        <ul style={listStyle}>
          <li><strong>Fonctionnement du service :</strong> authentification, personnalisation, gestion des sessions de jeu</li>
          <li><strong>Suivi pédagogique :</strong> historique de progression pour l'élève, le parent et l'enseignant</li>
          <li><strong>Facturation :</strong> gestion des abonnements via Stripe (nous ne stockons pas les numéros de carte bancaire)</li>
          <li><strong>Amélioration du service :</strong> statistiques anonymisées d'utilisation</li>
        </ul>
      </Section>

      <Section title="4. Base légale du traitement">
        <ul style={listStyle}>
          <li><strong>Exécution du contrat</strong> (Art. 6.1.b RGPD) : pour fournir le service éducatif</li>
          <li><strong>Consentement</strong> (Art. 6.1.a RGPD) : pour la création de compte et l'acceptation des CGU</li>
          <li><strong>Intérêt légitime</strong> (Art. 6.1.f RGPD) : pour l'amélioration du service</li>
          <li><strong>Mission d'intérêt public</strong> (Art. 6.1.e RGPD) : pour les comptes scolaires créés par les établissements dans le cadre de leur mission éducative</li>
        </ul>
      </Section>

      <Section title="5. Protection des données des mineurs">
        <p>Crazy Chrono est destiné aux enfants de 7 à 11 ans (CE1–CM2). Conformément à l'article 8 du RGPD et à l'article 45 de la loi Informatique et Libertés :</p>
        <ul style={listStyle}>
          <li>Les comptes élèves sont créés <strong>exclusivement par les enseignants ou les parents</strong>, jamais directement par les enfants</li>
          <li>Aucune donnée sensible n'est demandée aux enfants</li>
          <li>Les données des élèves sont <strong>minimisées</strong> au strict nécessaire pour le fonctionnement du service</li>
          <li>Les élèves ne peuvent pas supprimer leur compte eux-mêmes — cette action est réservée au parent ou à l'enseignant responsable</li>
          <li>Aucune publicité, aucun tracking publicitaire, aucun profilage commercial n'est effectué sur les données des mineurs</li>
        </ul>
      </Section>

      <Section title="6. Destinataires des données">
        <p>Vos données sont accessibles uniquement par :</p>
        <ul style={listStyle}>
          <li><strong>L'éditeur</strong> (Mr VERIN MARIUS) pour l'administration du service</li>
          <li><strong>L'enseignant</strong> de la classe (pour les comptes élèves) pour le suivi pédagogique</li>
          <li><strong>Stripe</strong> (sous-traitant certifié) pour le traitement des paiements</li>
          <li><strong>Supabase</strong> (sous-traitant, hébergeur de base de données)</li>
          <li><strong>Vercel et Render</strong> (sous-traitants, hébergeurs applicatifs)</li>
        </ul>
        <p>Aucune donnée personnelle n'est vendue, louée ou partagée avec des tiers à des fins commerciales.</p>
      </Section>

      <Section title="7. Transferts hors UE">
        <p>Certains sous-traitants (Vercel, Render, Supabase) sont basés aux États-Unis ou à Singapour. Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne (Art. 46 RGPD).</p>
      </Section>

      <Section title="8. Durée de conservation">
        <ul style={listStyle}>
          <li><strong>Comptes actifs :</strong> données conservées tant que le compte est actif</li>
          <li><strong>Comptes inactifs :</strong> supprimés automatiquement après 24 mois d'inactivité</li>
          <li><strong>Données de facturation :</strong> conservées 10 ans (obligation légale comptable)</li>
          <li><strong>Logs techniques :</strong> conservés 12 mois maximum</li>
        </ul>
      </Section>

      <Section title="9. Vos droits (Art. 15 à 22 RGPD)">
        <p>Vous disposez des droits suivants :</p>
        <ul style={listStyle}>
          <li><strong>Droit d'accès</strong> : savoir quelles données nous détenons sur vous</li>
          <li><strong>Droit de rectification</strong> : corriger des données inexactes</li>
          <li><strong>Droit à l'effacement</strong> (droit à l'oubli) : demander la suppression de vos données</li>
          <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré (JSON)</li>
          <li><strong>Droit d'opposition</strong> : vous opposer au traitement de vos données</li>
          <li><strong>Droit à la limitation du traitement</strong> : demander la suspension du traitement</li>
        </ul>
        <p>Pour exercer ces droits, utilisez les boutons <strong>"Télécharger mes données"</strong> et <strong>"Supprimer mon compte"</strong> dans la page <Link to="/account" style={linkStyle}>Mon compte</Link>, ou contactez-nous à : <a href="mailto:crazy.chrono.contact@gmail.com" style={linkStyle}>crazy.chrono.contact@gmail.com</a></p>
        <p>Vous pouvez également adresser une réclamation à la <strong>CNIL</strong> (Commission Nationale de l'Informatique et des Libertés) : <a href="https://www.cnil.fr" style={linkStyle}>www.cnil.fr</a></p>
      </Section>

      <Section title="10. Cookies">
        <p>Crazy Chrono utilise uniquement des <strong>cookies techniques strictement nécessaires</strong> au fonctionnement du service (authentification, session). Aucun cookie publicitaire ou de tracking n'est utilisé.</p>
        <p>Les données de session sont stockées dans le <strong>localStorage</strong> du navigateur (identifiant utilisateur, préférences de langue, statut d'abonnement). Ces données restent sur votre appareil et ne sont pas transmises à des tiers.</p>
      </Section>

      <Section title="11. Sécurité">
        <p>Nous mettons en œuvre les mesures techniques et organisationnelles appropriées pour protéger vos données :</p>
        <ul style={listStyle}>
          <li>Communication chiffrée (HTTPS / TLS)</li>
          <li>Mots de passe hashés (jamais stockés en clair)</li>
          <li>Authentification par token JWT</li>
          <li>Accès restreint aux données (Row Level Security sur Supabase)</li>
          <li>Séparation des environnements de développement et de production</li>
        </ul>
      </Section>
    </div>
  );
}

// ===== CGU / CGV =====
function CGU() {
  return (
    <div style={contentStyle}>
      <h2 style={h2Style}>Conditions Générales d'Utilisation et de Vente</h2>
      <p style={metaStyle}>Dernière mise à jour : 1er mars 2026</p>

      <Section title="1. Objet">
        <p>Les présentes Conditions Générales d'Utilisation (CGU) et Conditions Générales de Vente (CGV) régissent l'accès et l'utilisation de l'application web <strong>Crazy Chrono</strong> (<a href="https://app.crazy-chrono.com" style={linkStyle}>app.crazy-chrono.com</a>), éditée par Mr VERIN MARIUS.</p>
        <p>En créant un compte ou en utilisant le service, vous acceptez sans réserve les présentes conditions.</p>
      </Section>

      <Section title="2. Description du service">
        <p>Crazy Chrono est une application éducative interactive destinée aux élèves du primaire (CE1–CM2). Elle propose :</p>
        <ul style={listStyle}>
          <li>Des jeux pédagogiques couvrant les mathématiques, la botanique, la zoologie et d'autres thématiques</li>
          <li>Plusieurs modes de jeu : Solo, Multijoueur, Entraînement de classe, Arena</li>
          <li>Un mode Apprendre pour la révision</li>
          <li>Un suivi de progression pour les élèves, parents et enseignants</li>
        </ul>
      </Section>

      <Section title="3. Accès au service">
        <h4 style={h4Style}>Accès gratuit</h4>
        <p>Sans compte, tout utilisateur peut bénéficier de 3 sessions gratuites par jour en mode Solo.</p>

        <h4 style={h4Style}>Accès avec compte</h4>
        <p>La création d'un compte est gratuite et permet d'accéder au suivi de progression. L'accès illimité à tous les modes nécessite un abonnement payant.</p>

        <h4 style={h4Style}>Comptes élèves</h4>
        <p>Les comptes élèves sont créés par les enseignants ou les parents. L'élève se connecte avec un code d'accès fourni par son enseignant.</p>
      </Section>

      <Section title="4. Inscription et comptes">
        <p>L'utilisateur s'engage à fournir des informations exactes lors de son inscription. Il est responsable de la confidentialité de ses identifiants de connexion.</p>
        <p>Pour les comptes de mineurs, la responsabilité incombe au parent ou au représentant légal (pour les comptes famille) ou à l'établissement scolaire (pour les comptes élèves en contexte scolaire).</p>
      </Section>

      <Section title="5. Tarifs et paiement">
        <h4 style={h4Style}>Offres particuliers</h4>
        <ul style={listStyle}>
          <li><strong>Solidaire :</strong> 4,90€/mois — sur déclaration sur l'honneur de revenus modestes</li>
          <li><strong>Individuel :</strong> 9,90€/mois — accès complet pour 1 enfant</li>
          <li><strong>Famille :</strong> 14,90€/mois — accès pour 2 à 4 enfants</li>
          <li><strong>Annuel :</strong> 89,90€/an — équivalent à 7,49€/mois</li>
        </ul>

        <h4 style={h4Style}>Tarif solidaire</h4>
        <p>Le tarif solidaire est destiné aux familles à revenus modestes. Il donne accès aux mêmes fonctionnalités que le tarif individuel. La souscription nécessite une <strong>déclaration sur l'honneur</strong> attestant de revenus modestes. Toute fausse déclaration peut entraîner le passage au tarif normal (Art. 441-7 du Code pénal).</p>

        <h4 style={h4Style}>Offres institutions</h4>
        <p>Tarif dégressif selon le nombre d'élèves (de 9,90€ à 4,90€ par élève/mois). Facturation annuelle. Devis sur demande pour les volumes supérieurs à 1000 élèves.</p>

        <h4 style={h4Style}>Paiement</h4>
        <p>Les paiements sont traités de manière sécurisée par <strong>Stripe</strong>. Nous n'avons jamais accès à vos informations de carte bancaire.</p>
      </Section>

      <Section title="6. Droit de rétractation">
        <p>Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation ne s'applique pas aux contenus numériques non fournis sur un support matériel dont l'exécution a commencé avec l'accord du consommateur.</p>
        <p>Toutefois, vous pouvez <strong>résilier votre abonnement à tout moment</strong> sans frais. La résiliation prend effet à la fin de la période en cours.</p>
      </Section>

      <Section title="7. Résiliation">
        <p>Vous pouvez résilier votre abonnement à tout moment depuis votre espace personnel ou en contactant <a href="mailto:crazy.chrono.contact@gmail.com" style={linkStyle}>crazy.chrono.contact@gmail.com</a>.</p>
        <p>L'éditeur se réserve le droit de suspendre ou supprimer un compte en cas de non-respect des présentes CGU, notamment en cas d'utilisation frauduleuse ou abusive du service.</p>
      </Section>

      <Section title="8. Propriété intellectuelle">
        <p>Tout le contenu de Crazy Chrono (textes, images, sons, code, jeux, données éducatives) est protégé par le droit d'auteur. Toute reproduction non autorisée est interdite.</p>
        <p>L'utilisateur bénéficie d'un droit d'usage personnel et non cessible dans le cadre de son abonnement.</p>
      </Section>

      <Section title="9. Responsabilité">
        <p>L'éditeur s'engage à fournir un service de qualité mais ne garantit pas une disponibilité ininterrompue. L'accès peut être temporairement suspendu pour maintenance.</p>
        <p>L'éditeur ne saurait être tenu responsable des dommages résultant d'une utilisation inadaptée du service ou d'une interruption indépendante de sa volonté.</p>
      </Section>

      <Section title="10. Données personnelles">
        <p>Le traitement des données personnelles est décrit dans notre <Link to="/legal?tab=confidentialite" style={linkStyle}>Politique de confidentialité</Link>.</p>
      </Section>

      <Section title="11. Modification des CGU/CGV">
        <p>L'éditeur se réserve le droit de modifier les présentes conditions à tout moment. Les utilisateurs seront informés par email ou notification dans l'application. La poursuite de l'utilisation du service après modification vaut acceptation des nouvelles conditions.</p>
      </Section>

      <Section title="12. Droit applicable et juridiction">
        <p>Les présentes conditions sont soumises au droit français. En cas de litige, les parties s'engagent à rechercher une solution amiable. À défaut, les tribunaux de Fort-de-France (Martinique) seront seuls compétents.</p>
      </Section>

      <Section title="13. Contact">
        <p>Pour toute question relative aux présentes conditions :</p>
        <p><strong>Email :</strong> <a href="mailto:crazy.chrono.contact@gmail.com" style={linkStyle}>crazy.chrono.contact@gmail.com</a></p>
        <p><strong>Adresse :</strong> Chemin de ravine Houël, Castel Lamentin 97129</p>
      </Section>
    </div>
  );
}

// ===== Shared sub-components & styles =====

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 10px', borderBottom: '2px solid #e2e8f0', paddingBottom: 6 }}>{title}</h3>
      <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

const contentStyle = {};

const h2Style = {
  fontSize: 26, fontWeight: 900, color: '#0D6A7A', margin: '0 0 4px', textAlign: 'center',
};

const metaStyle = {
  textAlign: 'center', fontSize: 13, color: '#94a3b8', marginBottom: 32,
};

const h4Style = {
  fontSize: 15, fontWeight: 700, color: '#0D6A7A', margin: '16px 0 6px',
};

const linkStyle = {
  color: '#1AACBE', textDecoration: 'underline', fontWeight: 600,
};

const listStyle = {
  paddingLeft: 20, margin: '8px 0',
};
