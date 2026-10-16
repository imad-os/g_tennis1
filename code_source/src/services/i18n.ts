/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupportedLang = 'en' | 'fr' | 'es' | 'ar';

export interface TranslationStrings {
  title: string;
  subtitle: string;
  quickMatch: string;
  quickMatchDesc: string;
  local2p: string;
  local2pDesc: string;
  motionLab: string;
  motionLabDesc: string;
  settings: string;
  settingsDesc: string;
  phoneActive: string;
  gamepadReady: string;
  navigateHint: string;
  selectHint: string;
  backHint: string;
  adjustHint: string;
  paused: string;
  resume: string;
  restart: string;
  quit: string;
  matchWon: string;
  matchLost: string;
  playAgain: string;
  mainMenu: string;
  calibrate: string;
  calibrated: string;
  calibrateDesc: string;
  dominantHand: string;
  rightHand: string;
  leftHand: string;
  sensitivity: string;
  smoothing: string;
  quality: string;
  camera: string;
  surface: string;
  soundSfx: string;
  enabled: string;
  muted: string;
  saveClose: string;
  forehand: string;
  backhand: string;
  smash: string;
  power: string;
  rally: string;
  deuce: string;
  advantage: string;
  game: string;
  set: string;
  matchPoint: string;
  motionTab: string;
  graphicsTab: string;
  audioTab: string;
  controlsTab: string;
}

export const TRANSLATIONS: Record<SupportedLang, TranslationStrings> = {
  en: {
    title: 'GRAND SLAM 3D',
    subtitle: 'MOTION TENNIS CHAMPIONSHIP',
    quickMatch: 'Quick Match vs AI',
    quickMatchDesc: 'Single player exhibition against smart AI',
    local2p: 'Local 2-Player Versus',
    local2pDesc: 'P1 Motion or Pad vs P2 Gamepad / Remote',
    motionLab: 'Motion Lab & Practice',
    motionLabDesc: 'Test swing detection, oscilloscope & calibration',
    settings: 'Settings',
    settingsDesc: 'Tweak motion DSP, court surface & graphics',
    phoneActive: 'Phone Motion Active',
    gamepadReady: 'Gamepad / TV Remote Ready',
    navigateHint: 'Navigate',
    selectHint: 'Select',
    backHint: 'Back',
    adjustHint: 'Adjust',
    paused: 'MATCH PAUSED',
    resume: 'Resume Match',
    restart: 'Restart Match',
    quit: 'Quit to Title Screen',
    matchWon: 'CHAMPIONSHIP VICTORY!',
    matchLost: 'MATCH COMPLETED',
    playAgain: 'Play Again',
    mainMenu: 'Main Menu',
    calibrate: 'Calibrate Grip (Neutralize Bias)',
    calibrated: 'Grip Calibrated ✓',
    calibrateDesc: 'Hold phone like a tennis racket handle in your relaxed stance facing the TV, then press Calibrate.',
    dominantHand: 'Dominant Hand',
    rightHand: 'Right-Handed',
    leftHand: 'Left-Handed',
    sensitivity: 'Motion Sensitivity',
    smoothing: 'Tremor Smoothing Filter',
    quality: 'Graphics Quality Preset',
    camera: 'Broadcast Camera Angle',
    surface: 'Grand Slam Court Surface',
    soundSfx: 'Sound Effects (SFX)',
    enabled: 'Enabled',
    muted: 'Muted',
    saveClose: 'Save & Close',
    forehand: 'FOREHAND',
    backhand: 'BACKHAND',
    smash: 'SMASH',
    power: 'Power',
    rally: 'Rally',
    deuce: 'DEUCE',
    advantage: 'ADVANTAGE',
    game: 'GAME',
    set: 'SET',
    matchPoint: 'MATCH POINT',
    motionTab: '🎾 Motion',
    graphicsTab: '🎨 Graphics',
    audioTab: '🔊 Audio',
    controlsTab: '🎮 Controls',
  },
  fr: {
    title: 'GRAND CHELEM 3D',
    subtitle: 'CHAMPIONNAT DE TENNIS À DÉTECTION DE MOUVEMENT',
    quickMatch: 'Match Rapide vs IA',
    quickMatchDesc: 'Match individuel contre une IA réactive',
    local2p: 'Multijoueur Local 2 Joueurs',
    local2pDesc: 'J1 Téléphone/Manette vs J2 Manette/Télécommande',
    motionLab: 'Labo Mouvement & Entraînement',
    motionLabDesc: 'Test des frappes, oscilloscope et calibrage',
    settings: 'Paramètres',
    settingsDesc: 'Réglages DSP, surface de court et graphismes',
    phoneActive: 'Manette Téléphone Active',
    gamepadReady: 'Manette / Télécommande Prête',
    navigateHint: 'Naviguer',
    selectHint: 'Sélectionner',
    backHint: 'Retour',
    adjustHint: 'Ajuster',
    paused: 'MATCH EN PAUSE',
    resume: 'Reprendre le Match',
    restart: 'Recommencer le Match',
    quit: 'Quitter vers le Menu',
    matchWon: 'VICTOIRE DU TOURNOI !',
    matchLost: 'MATCH TERMINÉ',
    playAgain: 'Rejouer',
    mainMenu: 'Menu Principal',
    calibrate: 'Calibrer la Prise (Zéro Biais)',
    calibrated: 'Prise Calibrée ✓',
    calibrateDesc: 'Tenez votre téléphone comme un manche de raquette, puis appuyez sur Calibrer.',
    dominantHand: 'Main Dominante',
    rightHand: 'Droitier',
    leftHand: 'Gaucher',
    sensitivity: 'Sensibilité du Mouvement',
    smoothing: 'Filtre Anti-Tremblement',
    quality: 'Qualité Graphique',
    camera: 'Angle de Caméra',
    surface: 'Surface du Court',
    soundSfx: 'Effets Sonores (SFX)',
    enabled: 'Activé',
    muted: 'Coupé',
    saveClose: 'Enregistrer & Fermer',
    forehand: 'COUP DROIT',
    backhand: 'REVERS',
    smash: 'SMASH',
    power: 'Puissance',
    rally: 'Échange',
    deuce: 'ÉGALITÉ',
    advantage: 'AVANTAGE',
    game: 'JEU',
    set: 'MANCHE',
    matchPoint: 'BALLE DE MATCH',
    motionTab: '🎾 Mouvement',
    graphicsTab: '🎨 Graphismes',
    audioTab: '🔊 Audio',
    controlsTab: '🎮 Contrôles',
  },
  es: {
    title: 'GRAN SLAM 3D',
    subtitle: 'CAMPEONATO DE TENIS POR MOVIMIENTO',
    quickMatch: 'Partido Rápido vs IA',
    quickMatchDesc: 'Partido de exhibición individual contra la IA',
    local2p: '2 Jugadores Local',
    local2pDesc: 'J1 Movimiento/Mando vs J2 Mando/Mando a distancia',
    motionLab: 'Laboratorio de Movimiento',
    motionLabDesc: 'Prueba de golpes, osciloscopio y calibración',
    settings: 'Ajustes',
    settingsDesc: 'Calibrar DSP, pista y gráficos',
    phoneActive: 'Mando Teléfono Activo',
    gamepadReady: 'Mando / Control Remoto Listo',
    navigateHint: 'Navegar',
    selectHint: 'Seleccionar',
    backHint: 'Atrás',
    adjustHint: 'Ajustar',
    paused: 'PARTIDO EN PAUSA',
    resume: 'Continuar Partido',
    restart: 'Reiniciar Partido',
    quit: 'Salir al Menú',
    matchWon: '¡CAMPEÓN DEL TORNEO!',
    matchLost: 'PARTIDO FINALIZADO',
    playAgain: 'Jugar de Nuevo',
    mainMenu: 'Menú Principal',
    calibrate: 'Calibrar Agarre (Neutro)',
    calibrated: 'Agarre Calibrado ✓',
    calibrateDesc: 'Sujeta el teléfono como una raqueta frente al televisor y pulsa Calibrar.',
    dominantHand: 'Mano Dominante',
    rightHand: 'Diestro',
    leftHand: 'Zurdo',
    sensitivity: 'Sensibilidad de Movimiento',
    smoothing: 'Filtro de Suavizado',
    quality: 'Calidad Gráfica',
    camera: 'Ángulo de Cámara',
    surface: 'Superficie de Pista',
    soundSfx: 'Efectos de Sonido (SFX)',
    enabled: 'Activado',
    muted: 'Silenciado',
    saveClose: 'Guardar y Cerrar',
    forehand: 'DERECHA',
    backhand: 'REVÉS',
    smash: 'REMATE',
    power: 'Potencia',
    rally: 'Peloteo',
    deuce: 'DEUCE',
    advantage: 'VENTAJA',
    game: 'JUEGO',
    set: 'SET',
    matchPoint: 'PUNTO DE PARTIDO',
    motionTab: '🎾 Movimiento',
    graphicsTab: '🎨 Gráficos',
    audioTab: '🔊 Audio',
    controlsTab: '🎮 Controles',
  },
  ar: {
    title: 'غراند سلام 3D',
    subtitle: 'بطولة التنس باستشعار الحركة',
    quickMatch: 'مباراة سريعة ضد الذكاء الاصطناعي',
    quickMatchDesc: 'مباراة استعراضية فردية ضد الذكاء الاصطناعي',
    local2p: 'لاعبان محلياً (تنافسي)',
    local2pDesc: 'اللاعب 1 بالحركة أو الذراع ضد اللاعب 2 باليد أو الريموت',
    motionLab: 'مختبر الحركة والتدريب',
    motionLabDesc: 'اختبار الضربات ورسم الإشارة والمعايرة',
    settings: 'الإعدادات',
    settingsDesc: 'ضبط استشعار الحركة وأرضية الملعب والرسوميات',
    phoneActive: 'تحكم الهاتف بالحركة نشط',
    gamepadReady: 'ذراع التحكم / ريموت التلفاز جاهز',
    navigateHint: 'تنقل',
    selectHint: 'اختيار',
    backHint: 'رجوع',
    adjustHint: 'تعديل',
    paused: 'المباراة متوقفة مؤقتاً',
    resume: 'استئناف المباراة',
    restart: 'إعادة المباراة',
    quit: 'الخروج للقائمة الرئيسية',
    matchWon: 'فوز بالبطولة!',
    matchLost: 'انتهت المباراة',
    playAgain: 'اللعب مجدداً',
    mainMenu: 'القائمة الرئيسية',
    calibrate: 'معايرة قبضة اليد (تصفير الميل)',
    calibrated: 'تمت المعايرة بنجاح ✓',
    calibrateDesc: 'أمسك الهاتف كأنه مقبض مضرب تنس بوضعية مريحة مواجهاً للشاشة ثم اضغط معايرة.',
    dominantHand: 'اليد المستخدمة',
    rightHand: 'اليد اليمنى',
    leftHand: 'اليد اليسرى',
    sensitivity: 'حساسية الحركة',
    smoothing: 'مرشح تنقية الاهتزاز',
    quality: 'مستوى جودة الرسوميات',
    camera: 'زاوية كاميرا البث',
    surface: 'أرضية الملعب',
    soundSfx: 'المؤثرات الصوتية',
    enabled: 'مفعل',
    muted: 'مكتوم',
    saveClose: 'حفظ وإغلاق',
    forehand: 'ضربة أمامية',
    backhand: 'ضربة خلفية',
    smash: 'ساحقة',
    power: 'القوة',
    rally: 'تبادل الكرات',
    deuce: 'تعادل',
    advantage: 'أفضلية',
    game: 'شوط',
    set: 'مجموعة',
    matchPoint: 'نقطة المباراة',
    motionTab: '🎾 الحركة',
    graphicsTab: '🎨 الرسوميات',
    audioTab: '🔊 الصوت',
    controlsTab: '🎮 التحكم',
  },
};

let currentLang: SupportedLang = 'en';

export function setLanguage(lang: string) {
  if (lang === 'fr' || lang === 'es' || lang === 'ar') {
    currentLang = lang;
  } else {
    currentLang = 'en';
  }
}

export function getLanguage(): SupportedLang {
  return currentLang;
}

export function t(): TranslationStrings {
  return TRANSLATIONS[currentLang] || TRANSLATIONS.en;
}
