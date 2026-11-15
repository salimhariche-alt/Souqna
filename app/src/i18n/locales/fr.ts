// French is the default language. Every other language must have the same keys.
const fr = {
  tabs: {
    home: 'Accueil',
    search: 'Rechercher',
    sell: 'Vendre',
    messages: 'Messages',
    profile: 'Profil',
  },
  home: {
    title: 'Bienvenue sur Souqna',
    activeListings: 'Annonces actives',
    loading: 'Chargement…',
    error: 'Impossible de joindre le serveur.',
    retry: 'Réessayer',
    server: 'Serveur : {{url}}',
  },
  placeholder: {
    comingSoon: 'Bientôt disponible',
  },
  language: {
    label: 'Langue',
  },
};

export default fr;

// The shape every translation file must follow (same keys, any text).
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Translations = DeepStrings<typeof fr>;
