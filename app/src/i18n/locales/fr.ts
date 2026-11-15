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
  auth: {
    loginTitle: 'Connexion',
    signupTitle: 'Créer un compte',
    loginRequired: 'Connectez-vous pour continuer.',
    identifier: 'Téléphone ou e-mail',
    identifierPlaceholder: '0555 12 34 56 ou nom@exemple.com',
    password: 'Mot de passe',
    passwordHint: 'Au moins 8 caractères.',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    displayName: 'Nom affiché',
    displayNamePlaceholder: 'Ex. Amina B.',
    wilaya: 'Wilaya',
    chooseWilaya: 'Choisir une wilaya',
    searchWilaya: 'Rechercher (nom ou numéro)',
    noWilayaFound: 'Aucune wilaya trouvée.',
    close: 'Fermer',
    loginButton: 'Se connecter',
    signupButton: "S'inscrire",
    noAccount: 'Pas encore de compte ?',
    goToSignup: 'Créer un compte',
    haveAccount: 'Déjà un compte ?',
    goToLogin: 'Se connecter',
  },
  profile: {
    phone: 'Téléphone',
    email: 'E-mail',
    wilaya: 'Wilaya',
    logout: 'Se déconnecter',
  },
  errors: {
    required: 'Ce champ est obligatoire.',
    identifierRequired: 'Entrez votre numéro de téléphone ou votre e-mail.',
    passwordRequired: 'Entrez votre mot de passe.',
    phoneOrEmail: 'Entrez un numéro de téléphone ou un e-mail.',
    phoneInvalid:
      'Entrez un numéro de mobile algérien valide : 10 chiffres commençant par 05, 06 ou 07.',
    phoneTaken: 'Ce numéro de téléphone est déjà utilisé.',
    emailInvalid: 'Entrez une adresse e-mail valide.',
    emailTaken: 'Cette adresse e-mail est déjà utilisée.',
    passwordShort: 'Le mot de passe doit contenir au moins 8 caractères.',
    passwordCommon: 'Ce mot de passe est trop courant. Choisissez-en un autre.',
    passwordNumeric: 'Le mot de passe ne peut pas contenir uniquement des chiffres.',
    passwordSimilar: 'Le mot de passe ressemble trop à votre nom, téléphone ou e-mail.',
    nameRequired: 'Veuillez entrer votre nom.',
    wilayaRequired: 'Veuillez choisir votre wilaya.',
    wrongCredentials: 'Téléphone/e-mail ou mot de passe incorrect.',
    throttled: 'Trop de tentatives. Réessayez dans {{seconds}} secondes.',
    network: 'Impossible de joindre le serveur. Vérifiez votre connexion.',
    unknown: 'Une erreur est survenue. Veuillez réessayer.',
  },
};

export default fr;

// The shape every translation file must follow (same keys, any text).
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Translations = DeepStrings<typeof fr>;
