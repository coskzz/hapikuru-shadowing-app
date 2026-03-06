// =====================================================
// MOCK DATA (本番ではFirebase Firestoreに置き換える)
// =====================================================

const MOCK_USERS = [
  { id: 'tanaka',  password: '1234',        name: '田中 太郎', role: 'student' },
  { id: 'sato',    password: '1234',        name: '佐藤 花子', role: 'student' },
  { id: 'yamada',  password: '1234',        name: '山田 一郎', role: 'student' },
  { id: 'teacher', password: 'hapikuru2026', name: '田中先生',  role: 'admin'   },
];

const LESSONS = [
  {
    id: 1,
    title: 'Hummingbirds I',
    titleJa: 'ハチドリ（前半）',
    level: '中3',
    category: '自然',
    emoji: '🐦',
    available: true,
    text: 'There are more than 300 different kinds of hummingbirds. Many of these little birds can use their wings to make a humming sound. That is why they are called hummingbirds. The wings of a hummingbird are so little and move so fast that you cannot see them when the bird is flying.',
    textJa: 'ハチドリには300種類以上の異なる種類がいます。これらの小さな鳥の多くは、翼を使って羽音（ハミング音）を出すことができます。それが「ハチドリ」と呼ばれる理由です。ハチドリの翼はとても小さく、動きがとても速いため、鳥が飛んでいるときには翼を見ることができません。',
  },
  {
    id: 2,
    title: 'Hummingbirds II',
    titleJa: 'ハチドリ（後半）',
    level: '中3',
    category: '自然',
    emoji: '🐦',
    available: true,
    text: 'Is it hard to believe that this little bird travels long distances? Not at all. One kind of hummingbird flies thousands of miles. When the fall comes, it goes south, and when the spring comes, it goes north. Its little wings carry it about a mile per minute.',
    textJa: 'この小さな鳥が長距離を旅するとは信じられないでしょうか？まったくそんなことはありません。あるハチドリの種類は何千マイルも飛びます。秋が来ると南へ向かい、春が来ると北へ向かいます。その小さな翼は、鳥を1分間に約1マイルの速さで運んでいきます。',
  },
  {
    id: 3,
    title: 'Coming Soon',
    titleJa: '近日公開',
    level: '中3',
    category: '日常',
    emoji: '🌟',
    available: false,
    text: '',
  },
  {
    id: 4,
    title: 'Coming Soon',
    titleJa: '近日公開',
    level: '高1',
    category: '科学',
    emoji: '🔬',
    available: false,
    text: '',
  },
  {
    id: 5,
    title: 'Coming Soon',
    titleJa: '近日公開',
    level: '高1',
    category: '社会',
    emoji: '🌍',
    available: false,
    text: '',
  },
  {
    id: 6,
    title: 'Coming Soon',
    titleJa: '近日公開',
    level: '高2',
    category: '文化',
    emoji: '🎭',
    available: false,
    text: '',
  },
];
