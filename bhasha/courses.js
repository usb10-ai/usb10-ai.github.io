/* Course content for Bhasha. Each item: n = native script, t = transliteration, e = English meaning.
   Sentences are split into word tiles on spaces, so keep one space between words. */
window.COURSES = {
  te: {
    name: "Telugu", native: "తెలుగు", speech: "te", script: "Telugu", region: "Andhra Pradesh & Telangana",
    units: [
      { id: "greet", title: "Greetings", icon: "🙏",
        items: [
          { n: "నమస్కారం", t: "namaskāram", e: "Hello" },
          { n: "ధన్యవాదాలు", t: "dhanyavādālu", e: "Thank you" },
          { n: "అవును", t: "avunu", e: "Yes" },
          { n: "కాదు", t: "kādu", e: "No" },
          { n: "దయచేసి", t: "dayachēsi", e: "Please" },
          { n: "క్షమించండి", t: "kshaminchaṇḍi", e: "Sorry" },
          { n: "మంచి", t: "manchi", e: "Good" },
          { n: "స్నేహితుడు", t: "snēhituḍu", e: "Friend" }
        ],
        sentences: [
          { n: "మీరు ఎలా ఉన్నారు?", t: "mīru elā unnāru?", e: "How are you?" },
          { n: "నేను బాగున్నాను", t: "nēnu bāgunnānu", e: "I am fine" },
          { n: "మీ పేరు ఏమిటి?", t: "mī pēru ēmiṭi?", e: "What is your name?" },
          { n: "నా పేరు రవి", t: "nā pēru Ravi", e: "My name is Ravi" }
        ] },
      { id: "family", title: "Family", icon: "👪",
        items: [
          { n: "అమ్మ", t: "amma", e: "Mother" },
          { n: "నాన్న", t: "nānna", e: "Father" },
          { n: "అన్న", t: "anna", e: "Elder brother" },
          { n: "అక్క", t: "akka", e: "Elder sister" },
          { n: "తమ్ముడు", t: "tammuḍu", e: "Younger brother" },
          { n: "చెల్లి", t: "chelli", e: "Younger sister" },
          { n: "కొడుకు", t: "koḍuku", e: "Son" },
          { n: "కూతురు", t: "kūturu", e: "Daughter" }
        ],
        sentences: [
          { n: "ఈమె మా అమ్మ", t: "īme mā amma", e: "This is my mother" },
          { n: "మా నాన్న ఉపాధ్యాయుడు", t: "mā nānna upādhyāyuḍu", e: "My father is a teacher" },
          { n: "నాకు ఒక చెల్లి ఉంది", t: "nāku oka chelli undi", e: "I have one younger sister" }
        ] },
      { id: "num", title: "Numbers 1–10", icon: "🔢",
        items: [
          { n: "ఒకటి", t: "okaṭi", e: "One (1)" },
          { n: "రెండు", t: "reṇḍu", e: "Two (2)" },
          { n: "మూడు", t: "mūḍu", e: "Three (3)" },
          { n: "నాలుగు", t: "nālugu", e: "Four (4)" },
          { n: "ఐదు", t: "aidu", e: "Five (5)" },
          { n: "ఆరు", t: "āru", e: "Six (6)" },
          { n: "ఏడు", t: "ēḍu", e: "Seven (7)" },
          { n: "ఎనిమిది", t: "enimidi", e: "Eight (8)" },
          { n: "తొమ్మిది", t: "tommidi", e: "Nine (9)" },
          { n: "పది", t: "padi", e: "Ten (10)" }
        ],
        sentences: [
          { n: "నా దగ్గర రెండు పుస్తకాలు ఉన్నాయి", t: "nā daggara reṇḍu pustakālu unnāyi", e: "I have two books" }
        ] },
      { id: "food", title: "Food & Drink", icon: "🍛",
        items: [
          { n: "నీళ్ళు", t: "nīḷḷu", e: "Water" },
          { n: "అన్నం", t: "annaṁ", e: "Rice" },
          { n: "పాలు", t: "pālu", e: "Milk" },
          { n: "పండు", t: "paṇḍu", e: "Fruit" },
          { n: "అరటిపండు", t: "araṭipaṇḍu", e: "Banana" },
          { n: "మామిడిపండు", t: "māmiḍipaṇḍu", e: "Mango" },
          { n: "టీ", t: "ṭī", e: "Tea" },
          { n: "ఉప్పు", t: "uppu", e: "Salt" }
        ],
        sentences: [
          { n: "నేను నీళ్ళు తాగుతాను", t: "nēnu nīḷḷu tāgutānu", e: "I drink water" },
          { n: "నేను అన్నం తింటాను", t: "nēnu annaṁ tiṇṭānu", e: "I eat rice" },
          { n: "నాకు టీ కావాలి", t: "nāku ṭī kāvāli", e: "I want tea" }
        ] },
      { id: "color", title: "Colours", icon: "🎨",
        items: [
          { n: "ఎరుపు", t: "erupu", e: "Red" },
          { n: "ఆకుపచ్చ", t: "ākupachcha", e: "Green" },
          { n: "తెలుపు", t: "telupu", e: "White" },
          { n: "నలుపు", t: "nalupu", e: "Black" },
          { n: "పసుపు", t: "pasupu", e: "Yellow" },
          { n: "నీలం", t: "nīlaṁ", e: "Blue" }
        ],
        sentences: [
          { n: "పాలు తెల్లగా ఉంటాయి", t: "pālu tellagā uṇṭāyi", e: "Milk is white" },
          { n: "చెట్టు ఆకుపచ్చగా ఉంది", t: "cheṭṭu ākupachchagā undi", e: "The tree is green" }
        ] },
      { id: "around", title: "Around Us", icon: "🏡",
        items: [
          { n: "ఇల్లు", t: "illu", e: "House" },
          { n: "బడి", t: "baḍi", e: "School" },
          { n: "పుస్తకం", t: "pustakaṁ", e: "Book" },
          { n: "కుక్క", t: "kukka", e: "Dog" },
          { n: "పిల్లి", t: "pilli", e: "Cat" },
          { n: "ఆవు", t: "āvu", e: "Cow" },
          { n: "చెట్టు", t: "cheṭṭu", e: "Tree" },
          { n: "సూర్యుడు", t: "sūryuḍu", e: "Sun" }
        ],
        sentences: [
          { n: "ఇది నా ఇల్లు", t: "idi nā illu", e: "This is my house" },
          { n: "కుక్క పెద్దది", t: "kukka peddadi", e: "The dog is big" },
          { n: "నేను బడికి వెళ్తాను", t: "nēnu baḍiki veḷtānu", e: "I go to school" }
        ] },
      { id: "time", title: "Time", icon: "⏰",
        items: [
          { n: "ఈరోజు", t: "īrōju", e: "Today" },
          { n: "రేపు", t: "rēpu", e: "Tomorrow" },
          { n: "నిన్న", t: "ninna", e: "Yesterday" },
          { n: "ఉదయం", t: "udayaṁ", e: "Morning" },
          { n: "రాత్రి", t: "rātri", e: "Night" },
          { n: "రోజు", t: "rōju", e: "Day" },
          { n: "ఇప్పుడు", t: "ippuḍu", e: "Now" },
          { n: "తర్వాత", t: "tarvāta", e: "Later" }
        ],
        sentences: [
          { n: "రేపు కలుద్దాం", t: "rēpu kaluddāṁ", e: "See you tomorrow" },
          { n: "నేను ఇప్పుడు వెళ్తున్నాను", t: "nēnu ippuḍu veḷtunnānu", e: "I am going now" }
        ] }
    ],
    alphabet: {
      vowels: [["అ","a"],["ఆ","ā"],["ఇ","i"],["ఈ","ī"],["ఉ","u"],["ఊ","ū"],["ఋ","ru"],["ఎ","e"],["ఏ","ē"],["ఐ","ai"],["ఒ","o"],["ఓ","ō"],["ఔ","au"]],
      consonants: [["క","ka"],["ఖ","kha"],["గ","ga"],["ఘ","gha"],["చ","cha"],["ఛ","chha"],["జ","ja"],["ఝ","jha"],["ట","ṭa"],["ఠ","ṭha"],["డ","ḍa"],["ఢ","ḍha"],["ణ","ṇa"],["త","ta"],["థ","tha"],["ద","da"],["ధ","dha"],["న","na"],["ప","pa"],["ఫ","pha"],["బ","ba"],["భ","bha"],["మ","ma"],["య","ya"],["ర","ra"],["ల","la"],["వ","va"],["శ","śa"],["ష","sha"],["స","sa"],["హ","ha"],["ళ","ḷa"]]
    }
  },

  or: {
    name: "Odia", native: "ଓଡ଼ିଆ", speech: "or", script: "Odia", region: "Odisha",
    units: [
      { id: "greet", title: "Greetings", icon: "🙏",
        items: [
          { n: "ନମସ୍କାର", t: "namaskāra", e: "Hello" },
          { n: "ଧନ୍ୟବାଦ", t: "dhanyabāda", e: "Thank you" },
          { n: "ହଁ", t: "haṁ", e: "Yes" },
          { n: "ନା", t: "nā", e: "No" },
          { n: "ଦୟାକରି", t: "dayākari", e: "Please" },
          { n: "କ୍ଷମା କରନ୍ତୁ", t: "kshamā karantu", e: "Sorry" },
          { n: "ଭଲ", t: "bhala", e: "Good" },
          { n: "ସାଙ୍ଗ", t: "sāṅga", e: "Friend" }
        ],
        sentences: [
          { n: "ଆପଣ କେମିତି ଅଛନ୍ତି?", t: "āpaṇa kemiti achhanti?", e: "How are you?" },
          { n: "ମୁଁ ଭଲ ଅଛି", t: "muṁ bhala achhi", e: "I am fine" },
          { n: "ଆପଣଙ୍କ ନାମ କ'ଣ?", t: "āpaṇaṅka nāma ka'ṇa?", e: "What is your name?" },
          { n: "ମୋ ନାମ ରବି", t: "mo nāma Rabi", e: "My name is Ravi" }
        ] },
      { id: "family", title: "Family", icon: "👪",
        items: [
          { n: "ମା", t: "mā", e: "Mother" },
          { n: "ବାପା", t: "bāpā", e: "Father" },
          { n: "ବଡ଼ ଭାଇ", t: "baṛa bhāi", e: "Elder brother" },
          { n: "ବଡ଼ ଭଉଣୀ", t: "baṛa bhauṇī", e: "Elder sister" },
          { n: "ସାନ ଭାଇ", t: "sāna bhāi", e: "Younger brother" },
          { n: "ସାନ ଭଉଣୀ", t: "sāna bhauṇī", e: "Younger sister" },
          { n: "ପୁଅ", t: "pua", e: "Son" },
          { n: "ଝିଅ", t: "jhia", e: "Daughter" }
        ],
        sentences: [
          { n: "ଇଏ ମୋ ମା", t: "ie mo mā", e: "This is my mother" },
          { n: "ମୋ ବାପା ଶିକ୍ଷକ", t: "mo bāpā śikshaka", e: "My father is a teacher" },
          { n: "ମୋର ଗୋଟିଏ ସାନ ଭଉଣୀ ଅଛି", t: "mora goṭie sāna bhauṇī achhi", e: "I have one younger sister" }
        ] },
      { id: "num", title: "Numbers 1–10", icon: "🔢",
        items: [
          { n: "ଏକ", t: "eka", e: "One (1)" },
          { n: "ଦୁଇ", t: "dui", e: "Two (2)" },
          { n: "ତିନି", t: "tini", e: "Three (3)" },
          { n: "ଚାରି", t: "chāri", e: "Four (4)" },
          { n: "ପାଞ୍ଚ", t: "pāñcha", e: "Five (5)" },
          { n: "ଛଅ", t: "chha'a", e: "Six (6)" },
          { n: "ସାତ", t: "sāta", e: "Seven (7)" },
          { n: "ଆଠ", t: "āṭha", e: "Eight (8)" },
          { n: "ନଅ", t: "na'a", e: "Nine (9)" },
          { n: "ଦଶ", t: "daśa", e: "Ten (10)" }
        ],
        sentences: [
          { n: "ମୋ ପାଖରେ ଦୁଇଟି ବହି ଅଛି", t: "mo pākhare duiṭi bahi achhi", e: "I have two books" }
        ] },
      { id: "food", title: "Food & Drink", icon: "🍛",
        items: [
          { n: "ପାଣି", t: "pāṇi", e: "Water" },
          { n: "ଭାତ", t: "bhāta", e: "Rice" },
          { n: "କ୍ଷୀର", t: "kshīra", e: "Milk" },
          { n: "ଫଳ", t: "phaḷa", e: "Fruit" },
          { n: "କଦଳୀ", t: "kadaḷī", e: "Banana" },
          { n: "ଆମ୍ବ", t: "āmba", e: "Mango" },
          { n: "ଚା", t: "chā", e: "Tea" },
          { n: "ଲୁଣ", t: "luṇa", e: "Salt" }
        ],
        sentences: [
          { n: "ମୁଁ ପାଣି ପିଏ", t: "muṁ pāṇi pie", e: "I drink water" },
          { n: "ମୁଁ ଭାତ ଖାଏ", t: "muṁ bhāta khāe", e: "I eat rice" },
          { n: "ମୋତେ ଚା ଦରକାର", t: "mote chā darakāra", e: "I want tea" }
        ] },
      { id: "color", title: "Colours", icon: "🎨",
        items: [
          { n: "ନାଲି", t: "nāli", e: "Red" },
          { n: "ସବୁଜ", t: "sabuja", e: "Green" },
          { n: "ଧଳା", t: "dhaḷā", e: "White" },
          { n: "କଳା", t: "kaḷā", e: "Black" },
          { n: "ହଳଦିଆ", t: "haḷadiā", e: "Yellow" },
          { n: "ନୀଳ", t: "nīḷa", e: "Blue" }
        ],
        sentences: [
          { n: "କ୍ଷୀର ଧଳା", t: "kshīra dhaḷā", e: "Milk is white" },
          { n: "ଗଛଟି ସବୁଜ", t: "gachhaṭi sabuja", e: "The tree is green" }
        ] },
      { id: "around", title: "Around Us", icon: "🏡",
        items: [
          { n: "ଘର", t: "ghara", e: "House" },
          { n: "ବିଦ୍ୟାଳୟ", t: "bidyāḷaya", e: "School" },
          { n: "ବହି", t: "bahi", e: "Book" },
          { n: "କୁକୁର", t: "kukura", e: "Dog" },
          { n: "ବିରାଡ଼ି", t: "birāṛi", e: "Cat" },
          { n: "ଗାଈ", t: "gāi", e: "Cow" },
          { n: "ଗଛ", t: "gachha", e: "Tree" },
          { n: "ସୂର୍ଯ୍ୟ", t: "sūrjya", e: "Sun" }
        ],
        sentences: [
          { n: "ଏହା ମୋ ଘର", t: "ehā mo ghara", e: "This is my house" },
          { n: "କୁକୁରଟି ବଡ଼", t: "kukuraṭi baṛa", e: "The dog is big" },
          { n: "ମୁଁ ବିଦ୍ୟାଳୟକୁ ଯାଏ", t: "muṁ bidyāḷayaku jāe", e: "I go to school" }
        ] },
      { id: "time", title: "Time", icon: "⏰",
        items: [
          { n: "ଆଜି", t: "āji", e: "Today" },
          { n: "କାଲି", t: "kāli", e: "Tomorrow" },
          { n: "ଗତକାଲି", t: "gatakāli", e: "Yesterday" },
          { n: "ସକାଳ", t: "sakāḷa", e: "Morning" },
          { n: "ରାତି", t: "rāti", e: "Night" },
          { n: "ଦିନ", t: "dina", e: "Day" },
          { n: "ଏବେ", t: "ebe", e: "Now" },
          { n: "ପରେ", t: "pare", e: "Later" }
        ],
        sentences: [
          { n: "କାଲି ଦେଖା ହେବ", t: "kāli dekhā heba", e: "See you tomorrow" },
          { n: "ମୁଁ ଏବେ ଯାଉଛି", t: "muṁ ebe jāuchhi", e: "I am going now" }
        ] }
    ],
    alphabet: {
      vowels: [["ଅ","a"],["ଆ","ā"],["ଇ","i"],["ଈ","ī"],["ଉ","u"],["ଊ","ū"],["ଋ","ru"],["ଏ","e"],["ଐ","ai"],["ଓ","o"],["ଔ","au"]],
      consonants: [["କ","ka"],["ଖ","kha"],["ଗ","ga"],["ଘ","gha"],["ଚ","cha"],["ଛ","chha"],["ଜ","ja"],["ଝ","jha"],["ଟ","ṭa"],["ଠ","ṭha"],["ଡ","ḍa"],["ଢ","ḍha"],["ଣ","ṇa"],["ତ","ta"],["ଥ","tha"],["ଦ","da"],["ଧ","dha"],["ନ","na"],["ପ","pa"],["ଫ","pha"],["ବ","ba"],["ଭ","bha"],["ମ","ma"],["ଯ","ja (ya)"],["ର","ra"],["ଲ","la"],["ଶ","śa"],["ଷ","sha"],["ସ","sa"],["ହ","ha"],["ଳ","ḷa"]]
    }
  }
};
