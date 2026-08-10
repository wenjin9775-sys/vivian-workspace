/* =========================================================================
   韩语学习模块（Vivian 工作台）
   - 接入：index.html 在 app.js 之前引入本文件
   - 依赖（app.js 全局）：state / save / uid / esc / toast
   ========================================================================= */

/* ---------- 状态 ---------- */
function defaultKoreanState() {
  return {
    cur: "sounds",          // 当前子页：sounds/words/grammar/quiz/dialogue/culture
    learnedSounds: [],      // 已学发音（字符）
    learnedWords: [],       // 已学单词（ko）
    quiz: { best: {}, last: null },
    dialogueScene: null,
    vtest: { history: [] },
    book: { learned: [], favs: [] }
  };
}
function krState() { return state.korean && state.korean.cur !== undefined ? state.korean : (state.korean = defaultKoreanState()); }

/* ---------- 语音（Web Speech API，ko-KR） ---------- */
function speakKO(text) {
  try {
    if (!("speechSynthesis" in window)) { krToast("当前浏览器不支持语音朗读"); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR"; u.rate = 0.85; u.pitch = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {}
}
function krToast(m) { if (typeof toast === "function") toast(m); }

/* ---------- 韩字音节分解（初声/中声/终声） ---------- */
const KR_CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const KR_JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ","ㅙ"];
const KR_JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function krIsSyllable(ch) { const c = ch.codePointAt(0); return c >= 0xAC00 && c <= 0xD7A3; }
function krDecompose(syl) {
  const c = syl.codePointAt(0);
  if (c < 0xAC00 || c > 0xD7A3) return null;
  const idx = c - 0xAC00;
  const cho = Math.floor(idx / 588);
  const jung = Math.floor((idx % 588) / 28);
  const jong = idx % 28;
  return { cho: KR_CHO[cho], jung: KR_JUNG[jung], jong: jong ? KR_JONG[jong] : "" };
}
function krComposeHTML(ko) {
  const parts = [];
  for (const ch of ko) {
    if (krIsSyllable(ch)) {
      const d = krDecompose(ch);
      const inner = [d.cho, d.jung, d.jong].filter(Boolean).join(" + ");
      parts.push(`<span class="kr-comp"><b>${ch}</b><i>${esc(inner)}</i></span>`);
    } else {
      parts.push(`<span class="kr-comp"><b>${esc(ch)}</b></span>`);
    }
  }
  return parts.join("");
}

/* =========================================================================
   数据集
   ========================================================================= */

/* 四十音：19 辅音 + 21 元音，发音标准参考《优校园韩语》等教材 */
const KR_SOUNDS = [
  // 辅音
  { ch: "ㄱ", t: "c", name: "기역", roman: "g/k", pron: "发音类似汉语“哥”的开头，在词首读 g，在词尾或紧音前读 k。", tip: "起笔横，再写竖，最后向左下出钩。" },
  { ch: "ㄲ", t: "c", name: "쌍기역", roman: "kk", pron: "紧音，比 ㄱ 更用力、短促，声带不送气。", tip: "两个 ㄱ 并排，注意写得紧实。" },
  { ch: "ㄴ", t: "c", name: "니은", roman: "n", pron: "发音同汉字“那”的声母 n。", tip: "先竖再向左下弯。" },
  { ch: "ㄷ", t: "c", name: "디귿", roman: "d/t", pron: "类似“大”的开头，词首 d，词尾 t。", tip: "横、竖、横，像“口”少一竖。" },
  { ch: "ㄸ", t: "c", name: "쌍디귿", roman: "tt", pron: "紧音，短促用力。", tip: "两个 ㄷ 并排。" },
  { ch: "ㄹ", t: "c", name: "리을", roman: "r/l", pron: "舌尖弹音，词首近似 r，词尾近似 l。", tip: "一笔向右下弯再上提。" },
  { ch: "ㅁ", t: "c", name: "미음", roman: "m", pron: "同“妈”的声母 m。", tip: "先竖，再写两个小折。" },
  { ch: "ㅂ", t: "c", name: "비읍", roman: "b/p", pron: "类似“波”的开头，词首 b，词尾 p。", tip: "像“口”字框。" },
  { ch: "ㅃ", t: "c", name: "쌍비읍", roman: "pp", pron: "紧音。", tip: "两个 ㅂ 并排。" },
  { ch: "ㅅ", t: "c", name: "시옷", roman: "s", pron: "同“撒”的声母 s。", tip: "像波浪形，一笔写成。" },
  { ch: "ㅆ", t: "c", name: "쌍시옷", roman: "ss", pron: "紧音 s。", tip: "两个 ㅅ 并排。" },
  { ch: "ㅇ", t: "c", name: "이응", roman: "ng/-", pron: "作初声不发音，作终声读 ng（后鼻音）。", tip: "一个圆圈，最简单。" },
  { ch: "ㅈ", t: "c", name: "지읒", roman: "j", pron: "类似“家”的声母 j。", tip: "横、竖、横折、点。" },
  { ch: "ㅉ", t: "c", name: "쌍지읒", roman: "jj", pron: "紧音 j。", tip: "两个 ㅈ 并排。" },
  { ch: "ㅊ", t: "c", name: "치읓", roman: "ch", pron: "类似“吃”的声母 ch。", tip: "ㅈ 加一竖出头。" },
  { ch: "ㅋ", t: "c", name: "키읔", roman: "k", pron: "送气音，类似“科”的声母。", tip: "ㄱ 加一竖出头。" },
  { ch: "ㅌ", t: "c", name: "티읕", roman: "t", pron: "送气音，类似“特”的声母。", tip: "ㄷ 加一竖出头。" },
  { ch: "ㅍ", t: "c", name: "피읖", roman: "p", pron: "送气音，类似“坡”的声母。", tip: "ㅂ 加一竖出头。" },
  { ch: "ㅎ", t: "c", name: "히읗", roman: "h", pron: "送气音，类似“喝”的声母。", tip: "ㅇ 上加一横。" },
  // 元音
  { ch: "ㅏ", t: "v", name: "아", roman: "a", pron: "开口度大，类似“啊”。", tip: "竖线向右一横。" },
  { ch: "ㅑ", t: "v", name: "야", roman: "ya", pron: "i + a，类似“呀”。", tip: "短竖加 ㅏ。" },
  { ch: "ㅓ", t: "v", name: "어", roman: "eo", pron: "嘴半开，舌身后缩，类似“哦”但更扁。", tip: "竖线向左一横。" },
  { ch: "ㅕ", t: "v", name: "여", roman: "yeo", pron: "i + eo，类似“约”。", tip: "短竖加 ㅓ。" },
  { ch: "ㅗ", t: "v", name: "오", roman: "o", pron: "口型圆拢，类似“哦”。", tip: "横线向下一竖。" },
  { ch: "ㅛ", t: "v", name: "요", roman: "yo", pron: "i + o，类似“哟”。", tip: "短竖加 ㅗ。" },
  { ch: "ㅜ", t: "v", name: "우", roman: "u", pron: "口型圆拢突出，类似“乌”。", tip: "横线向上一竖。" },
  { ch: "ㅠ", t: "v", name: "유", roman: "yu", pron: "i + u，类似“悠”。", tip: "短竖加 ㅜ。" },
  { ch: "ㅡ", t: "v", name: "으", roman: "eu", pron: "嘴微张，舌身平放，类似轻声“呃”。", tip: "一条横线。" },
  { ch: "ㅣ", t: "v", name: "이", roman: "i", pron: "类似“衣”。", tip: "一条竖线。" },
  { ch: "ㅐ", t: "v", name: "애", roman: "ae", pron: "ㅏ 与 ㅣ 结合，类似“唉”。", tip: "ㅏ 加 ㅣ。" },
  { ch: "ㅒ", t: "v", name: "얘", roman: "yae", pron: "i + ae。", tip: "短竖加 ㅐ。" },
  { ch: "ㅔ", t: "v", name: "에", roman: "e", pron: "ㅓ 与 ㅣ 结合，类似“诶”。", tip: "ㅓ 加 ㅣ。" },
  { ch: "ㅖ", t: "v", name: "예", roman: "ye", pron: "i + e。", tip: "短竖加 ㅔ。" },
  { ch: "ㅘ", t: "v", name: "와", roman: "wa", pron: "ㅗ + ㅏ，类似“哇”。", tip: "ㅗ 加 ㅏ。" },
  { ch: "ㅚ", t: "v", name: "외", roman: "oe", pron: "ㅗ + ㅣ，类似“喂”。", tip: "ㅗ 加 ㅣ。" },
  { ch: "ㅝ", t: "v", name: "워", roman: "wo", pron: "ㅜ + ㅓ，类似“窝”。", tip: "ㅜ 加 ㅓ。" },
  { ch: "ㅞ", t: "v", name: "웨", roman: "we", pron: "ㅜ + ㅔ。", tip: "ㅜ 加 ㅔ。" },
  { ch: "ㅟ", t: "v", name: "위", roman: "wi", pron: "ㅜ + ㅣ，类似“威”。", tip: "ㅜ 加 ㅣ。" },
  { ch: "ㅢ", t: "v", name: "의", roman: "ui", pron: "ㅡ + ㅣ，类似“欸”。", tip: "ㅡ 加 ㅣ。" },
  { ch: "ㅙ", t: "v", name: "왜", roman: "wae", pron: "ㅗ + ㅐ，类似“外”。", tip: "ㅗ 加 ㅐ。" }
];

/* 单词：覆盖 TOPIK 1~6 与日常生活，comp 由程序自动分解 */
const KR_WORDS = [
  { ko: "안녕하세요", roman: "an-nyeong-ha-se-yo", cn: "你好（敬语）", level: 1, cat: "问候" },
  { ko: "감사합니다", roman: "gam-sa-ham-ni-da", cn: "谢谢", level: 1, cat: "问候" },
  { ko: "죄송합니다", roman: "joe-song-ham-ni-da", cn: "对不起", level: 1, cat: "问候" },
  { ko: "반갑습니다", roman: "ban-gap-seum-ni-da", cn: "很高兴认识你", level: 1, cat: "问候" },
  { ko: "네", roman: "ne", cn: "是 / 好", level: 1, cat: "日常" },
  { ko: "아니요", roman: "a-ni-yo", cn: "不是", level: 1, cat: "日常" },
  { ko: "화이팅", roman: "hwa-iting", cn: "加油", level: 1, cat: "日常" },
  { ko: "좋아요", roman: "jo-a-yo", cn: "喜欢 / 好", level: 1, cat: "情感" },
  { ko: "싫어요", roman: "si-reo-yo", cn: "讨厌", level: 1, cat: "情感" },
  { ko: "가족", roman: "ga-jok", cn: "家人", level: 1, cat: "家庭" },
  { ko: "아버지", roman: "a-beo-ji", cn: "爸爸", level: 1, cat: "家庭" },
  { ko: "어머니", roman: "eo-meo-ni", cn: "妈妈", level: 1, cat: "家庭" },
  { ko: "오빠", roman: "o-ppa", cn: "哥哥（女称）", level: 1, cat: "家庭" },
  { ko: "언니", roman: "eon-ni", cn: "姐姐（女称）", level: 1, cat: "家庭" },
  { ko: "친구", roman: "chin-gu", cn: "朋友", level: 1, cat: "日常" },
  { ko: "물", roman: "mul", cn: "水", level: 1, cat: "食物" },
  { ko: "밥", roman: "bap", cn: "饭", level: 1, cat: "食物" },
  { ko: "김치", roman: "gim-chi", cn: "泡菜", level: 1, cat: "食物" },
  { ko: "불고기", roman: "bul-go-gi", cn: "烤肉", level: 1, cat: "食物" },
  { ko: "라면", roman: "ra-myeon", cn: "拉面", level: 1, cat: "食物" },
  { ko: "커피", roman: "keo-pi", cn: "咖啡", level: 1, cat: "食物" },
  { ko: "빵", roman: "ppang", cn: "面包", level: 1, cat: "食物" },
  { ko: "사과", roman: "sa-gwa", cn: "苹果", level: 2, cat: "食物" },
  { ko: "과일", roman: "gwa-il", cn: "水果", level: 2, cat: "食物" },
  { ko: "고기", roman: "go-gi", cn: "肉", level: 2, cat: "食物" },
  { ko: "학교", roman: "hak-gyo", cn: "学校", level: 1, cat: "学习" },
  { ko: "선생님", roman: "seon-saeng-nim", cn: "老师", level: 1, cat: "学习" },
  { ko: "학생", roman: "hak-saeng", cn: "学生", level: 1, cat: "学习" },
  { ko: "공부", roman: "gong-bu", cn: "学习", level: 1, cat: "学习" },
  { ko: "수업", roman: "su-eop", cn: "课", level: 2, cat: "学习" },
  { ko: "시험", roman: "si-heom", cn: "考试", level: 2, cat: "学习" },
  { ko: "숙제", roman: "suk-je", cn: "作业", level: 2, cat: "学习" },
  { ko: "도서관", roman: "do-seo-gwan", cn: "图书馆", level: 3, cat: "学习" },
  { ko: "오늘", roman: "o-neul", cn: "今天", level: 1, cat: "时间" },
  { ko: "내일", roman: "nae-il", cn: "明天", level: 1, cat: "时间" },
  { ko: "어제", roman: "eo-je", cn: "昨天", level: 1, cat: "时间" },
  { ko: "시간", roman: "si-gan", cn: "时间", level: 1, cat: "时间" },
  { ko: "아침", roman: "a-chim", cn: "早上", level: 1, cat: "时间" },
  { ko: "점심", roman: "jeom-sim", cn: "中午 / 午饭", level: 1, cat: "时间" },
  { ko: "저녁", roman: "jeo-nyeok", cn: "晚上", level: 1, cat: "时间" },
  { ko: "주말", roman: "ju-mal", cn: "周末", level: 2, cat: "时间" },
  { ko: "빨간색", roman: "ppal-gan-saek", cn: "红色", level: 2, cat: "颜色" },
  { ko: "파란색", roman: "pa-ran-saek", cn: "蓝色", level: 2, cat: "颜色" },
  { ko: "노란색", roman: "no-ran-saek", cn: "黄色", level: 2, cat: "颜色" },
  { ko: "하얀색", roman: "ha-yan-saek", cn: "白色", level: 2, cat: "颜色" },
  { ko: "검은색", roman: "geo-eun-saek", cn: "黑色", level: 2, cat: "颜色" },
  { ko: "초록색", roman: "cho-rok-saek", cn: "绿色", level: 3, cat: "颜色" },
  { ko: "날씨", roman: "nal-ssi", cn: "天气", level: 2, cat: "天气" },
  { ko: "비", roman: "bi", cn: "雨", level: 2, cat: "天气" },
  { ko: "눈", roman: "nun", cn: "雪", level: 2, cat: "天气" },
  { ko: "바람", roman: "ba-ram", cn: "风", level: 3, cat: "天气" },
  { ko: "춥다", roman: "chup-da", cn: "冷", level: 2, cat: "天气" },
  { ko: "따뜻하다", roman: "tta-tteut-ha-da", cn: "温暖", level: 3, cat: "天气" },
  { ko: "비행기", roman: "bi-haeng-gi", cn: "飞机", level: 3, cat: "旅行" },
  { ko: "기차", roman: "gi-cha", cn: "火车", level: 3, cat: "旅行" },
  { ko: "호텔", roman: "ho-tel", cn: "酒店", level: 3, cat: "旅行" },
  { ko: "여권", roman: "yeo-gwon", cn: "护照", level: 3, cat: "旅行" },
  { ko: "공항", roman: "gong-hang", cn: "机场", level: 3, cat: "旅行" },
  { ko: "지도", roman: "ji-do", cn: "地图", level: 4, cat: "旅行" },
  { ko: "행복하다", roman: "haeng-bo-ka-da", cn: "幸福", level: 3, cat: "情感" },
  { ko: "슬프다", roman: "seul-peu-da", cn: "悲伤", level: 3, cat: "情感" },
  { ko: "피곤하다", roman: "pi-gon-ha-da", cn: "累", level: 2, cat: "情感" },
  { ko: "기쁘다", roman: "gi-ppeu-da", cn: "高兴", level: 3, cat: "情感" },
  { ko: "가다", roman: "ga-da", cn: "去", level: 1, cat: "动词" },
  { ko: "오다", roman: "o-da", cn: "来", level: 1, cat: "动词" },
  { ko: "먹다", roman: "meok-da", cn: "吃", level: 1, cat: "动词" },
  { ko: "마시다", roman: "ma-si-da", cn: "喝", level: 1, cat: "动词" },
  { ko: "보다", roman: "bo-da", cn: "看", level: 1, cat: "动词" },
  { ko: "읽다", roman: "ik-da", cn: "读", level: 2, cat: "动词" },
  { ko: "쓰다", roman: "sseu-da", cn: "写", level: 1, cat: "动词" },
  { ko: "사다", roman: "sa-da", cn: "买", level: 1, cat: "动词" },
  { ko: "공부하다", roman: "gong-bu-ha-da", cn: "学习（动词）", level: 1, cat: "动词" },
  { ko: "운동하다", roman: "un-dong-ha-da", cn: "运动", level: 2, cat: "动词" },
  { ko: "자다", roman: "ja-da", cn: "睡", level: 1, cat: "动词" },
  { ko: "일하다", roman: "il-ha-da", cn: "工作", level: 2, cat: "动词" },
  { ko: "집", roman: "jip", cn: "家", level: 1, cat: "生活" },
  { ko: "방", roman: "bang", cn: "房间", level: 2, cat: "生活" },
  { ko: "문", roman: "mun", cn: "门", level: 2, cat: "生活" },
  { ko: "시장", roman: "si-jang", cn: "市场", level: 2, cat: "生活" },
  { ko: "은행", roman: "eun-haeng", cn: "银行", level: 3, cat: "生活" },
  { ko: "병원", roman: "byeong-won", cn: "医院", level: 2, cat: "生活" },
  { ko: "약", roman: "yak", cn: "药", level: 2, cat: "生活" },
  { ko: "사회", roman: "sa-hoe", cn: "社会", level: 4, cat: "高级" },
  { ko: "경제", roman: "gyeong-je", cn: "经济", level: 4, cat: "高级" },
  { ko: "환경", roman: "hwan-gyeong", cn: "环境", level: 4, cat: "高级" },
  { ko: "문화", roman: "mun-hwa", cn: "文化", level: 3, cat: "高级" },
  { ko: "예술", roman: "ye-sul", cn: "艺术", level: 4, cat: "高级" },
  { ko: "과학", roman: "gwa-hak", cn: "科学", level: 4, cat: "高级" },
  { ko: "정부", roman: "jeong-bu", cn: "政府", level: 5, cat: "高级" },
  { ko: "정치", roman: "jeong-chi", cn: "政治", level: 5, cat: "高级" },
  { ko: "발전", roman: "bal-jeon", cn: "发展", level: 5, cat: "高级" },
  { ko: "효율적", roman: "hyo-yul-jeok", cn: "高效的", level: 5, cat: "高级" }
];

/* 语法：常见语法点 + B站讲解视频（搜索链接，始终展示最新） */
const KR_GRAMMAR = [
  { id: "ida", title: "이다 / 다（是）", roman: "N(i)da", expl: "体词后接 이다/다 表示“是”。敬语用 입니다，非敬语用 이야/야。", ex: { ko: "저는 학생입니다.", cn: "我是学生。" }, video: "韩语 이다 语法 讲解" },
  { id: "eun", title: "은 / 는（主题·对比）", roman: "eun/neun", expl: "附在体词后表示主题或对比。收音后用 은，无收音用 는。", ex: { ko: "저는 학생입니다.", cn: "我（主题）是学生。" }, video: "韩语 은는 주제 격조사" },
  { id: "iga", title: "이 / 가（主语）", roman: "i/ga", expl: "表示主语。收音后用 이，无收音用 가。常与 은/는 对照使用。", ex: { ko: "비가 와요.", cn: "下雨了。" }, video: "韩语 이가 주격조사" },
  { id: "eul", title: "을 / 를（宾语）", roman: "eul/reul", expl: "表示宾语。收音后用 을，无收音用 를。", ex: { ko: "밥을 먹어요.", cn: "吃饭。" }, video: "韩语 을를 목적격" },
  { id: "e", title: "에 / 에서（在·去·从）", roman: "e/eseo", expl: "에 表时间/地点“在、去”；에서 表“从…（来/做）”。", ex: { ko: "학교에 가요.", cn: "去学校。" }, video: "韩语 에 에서 차이" },
  { id: "ro", title: "(으)로（用·方向）", roman: "eu-ro", expl: "表示工具、手段、方向。收音后用 으로，无收音用 로。", ex: { ko: "버스로 가요.", cn: "坐公交去。" }, video: "韩语 으로 도구" },
  { id: "wa", title: "와 / 과 · 하고（和）", roman: "wa/gwa", expl: "连接两个体词表示“和”。与 하고 同义。", ex: { ko: "사과와 배", cn: "苹果和梨。" }, video: "韩语 와과 하고" },
  { id: "ayo", title: "아 / 어요（准敬语终结）", roman: "a/eo-yo", expl: "最常用陈述/疑问/命令/共动结尾。ㅏ/ㅗ 用 아요，其余用 어요。", ex: { ko: "가요 / 먹어요", cn: "去 / 吃。" }, video: "韩语 아요 어요 만들기" },
  { id: "psida", title: "(으)ㅂ시다（共动·敬语）", roman: "eu-psida", expl: "表示“一起做…吧”，较正式。收音后用 읍시다，无收音用 ㅂ시다。", ex: { ko: "공부합시다.", cn: "一起学习吧。" }, video: "韩语 ㅂ시다" },
  { id: "get", title: "겠（意志·推测）", roman: "get", expl: "附于动词词干后表意志“要做”或推测。", ex: { ko: "도와주겠습니다.", cn: "我来帮忙。" }, video: "韩语 겠 语法" },
  { id: "neunde", title: "는데 / 은데（背景·转折）", roman: "neun-de", expl: "连接分句，表背景、轻微转折或理由。", ex: { ko: "배고픈데 밥 먹자.", cn: "饿了，吃饭吧。" }, video: "韩语 는데 은데" },
  { id: "myeon", title: "면 / 으면（如果）", roman: "myeon", expl: "表示条件“如果”。收音后用 으면，无收音用 면。", ex: { ko: "시간이 있으면 가요.", cn: "有时间的话就去。" }, video: "韩语 면 으면 조건" },
  { id: "aseo", title: "아 / 어서（因为·顺序）", roman: "a/eo-seo", expl: "表原因“因为”或动作先后“…之后”。", ex: { ko: "피곤해서 자요.", cn: "因为累，所以睡了。" }, video: "韩语 아서 어서 이유" },
  { id: "do", title: "도（也）", roman: "do", expl: "表示“也”，附在体词后。", ex: { ko: "저도 학생이에요.", cn: "我也是学生。" }, video: "韩语 도 도움말" },
  { id: "mod", title: "(으)ㄴ/는/ㄹ（定语词尾）", roman: "modifier", expl: "修饰名词：过去 (으)ㄴ、现在 는、将来 (으)ㄹ。", ex: { ko: "예쁜 꽃", cn: "漂亮的花。" }, video: "韩语 관형사형 ㄴ는ㄹ" }
];

/* 对话：6 个场景，切换场景对话随之改变 */
const KR_DIALOGUES = {
  "식당": [
    { ko: "어서 오세요. 몇 분이세요?", roman: "eo-seo o-se-yo. myeot bu-ni-se-yo?", cn: "欢迎光临。几位？" },
    { ko: "두 명이요.", roman: "du myeong-i-yo.", cn: "两位。" },
    { ko: "이쪽으로 앉으세요.", roman: "i-jjok-eu-ro an-jeu-se-yo.", cn: "请坐这边。" },
    { ko: "메뉴 좀 주세요.", roman: "me-nyu jom ju-se-yo.", cn: "请给我菜单。" },
    { ko: "불고기 하나랑 국수 주세요.", roman: "bul-go-gi ha-na-rang guk-su ju-se-yo.", cn: "要一份烤肉和一份面条。" },
    { ko: "잘 먹겠습니다.", roman: "jal meok-get-seum-ni-da.", cn: "我开动了（用餐前）。" }
  ],
  "쇼핑": [
    { ko: "어떤 색을 찾으세요?", roman: "eo-tteon saek-eul cha-jeu-se-yo?", cn: "您在找什么颜色？" },
    { ko: "하얀색 티셔츠 있어요?", roman: "ha-yan-saek ti-syeo-cheu i-sseo-yo?", cn: "有白色的T恤吗？" },
    { ko: "네, 이거 어떠세요?", roman: "ne, i-geo eo-tteo-se-yo?", cn: "有，这件怎么样？" },
    { ko: "얼마예요?", roman: "eol-ma-ye-yo?", cn: "多少钱？" },
    { ko: "삼만 원이에요.", roman: "sam-man won-i-e-yo.", cn: "三万韩元。" },
    { ko: "조금 깎아 주세요.", roman: "jo-geum kka-kka ju-se-yo.", cn: "便宜一点吧。" }
  ],
  "학교": [
    { ko: "안녕하세요, 선생님.", roman: "an-nyeong-ha-se-yo, seon-saeng-nim.", cn: "老师好。" },
    { ko: "안녕, 오늘 수업 있다?", roman: "an-nyeong, o-neul su-eop iss-na?", cn: "嗨，今天有课吗？" },
    { ko: "응, 아홉 시에 한국어 수업이야.", roman: "eung, a-hop si-e han-gu-geo su-eo-bi-ya.", cn: "有，九点有韩语课。" },
    { ko: "숙제 다 했어?", roman: "suk-je da hae-sseo?", cn: "作业都做了吗？" },
    { ko: "아직 못 했어. 도서관 갈래?", roman: "a-jik mot hae-sseo. do-seo-gwan gal-lae?", cn: "还没做。去图书馆吗？" },
    { ko: "그래, 같이 가자.", roman: "geu-rae, ga-chi ga-ja.", cn: "好，一起去吧。" }
  ],
  "공항": [
    { ko: "여권 보여 주세요.", roman: "yeo-gwon bo-yeo ju-se-yo.", cn: "请出示护照。" },
    { ko: "네, 여기 있습니다.", roman: "ne, yeo-gi iss-seum-ni-da.", cn: "好的，在这里。" },
    { ko: "한국 가십니까?", roman: "han-guk ga-sim-ni-kka?", cn: "去韩国吗？" },
    { ko: "네, 서울로 갑니다.", roman: "ne, seo-ul-lo gam-ni-da.", cn: "是的，去首尔。" },
    { ko: "짐 두 개 부치겠습니다.", roman: "jim du gae bu-chi-get-seum-ni-da.", cn: "要托运两件行李。" },
    { ko: "탑승권 받으세요. 좋은 여행 되세요.", roman: "tap-seung-gwon ba-deu-se-yo. jo-eun yeo-haeng doe-se-yo.", cn: "请拿登机牌。祝您旅途愉快。" }
  ],
  "병원": [
    { ko: "어디가 아파요?", roman: "eo-di-ga a-pa-yo?", cn: "哪里不舒服？" },
    { ko: "머리가 아프고 열이 있어요.", roman: "meo-ri-ga a-peu-go yeo-ri iss-eo-yo.", cn: "头疼，还发烧。" },
    { ko: "언제부터 그랬어요?", roman: "eon-je-bu-teo geu-rae-sseo-yo?", cn: "从什么时候开始的？" },
    { ko: "어제 밤부터요.", roman: "eo-je bam-bu-teo-yo.", cn: "从昨晚开始。" },
    { ko: "약을 드릴게요. 쉬세요.", roman: "ya-geul deu-ril-ge-yo. swi-se-yo.", cn: "给您开药，多休息。" },
    { ko: "감사합니다, 선생님.", roman: "gam-sa-ham-ni-da, seon-saeng-nim.", cn: "谢谢医生。" }
  ],
  "인사": [
    { ko: "만나서 반갑습니다.", roman: "man-na-seo ban-gap-seum-ni-da.", cn: "很高兴见到您。" },
    { ko: "저는 비비안입니다.", roman: "jeo-neun bi-bi-an-im-ni-da.", cn: "我是 Vivian。" },
    { ko: "이름이 어떻게 되세요?", roman: "i-reu-mi eo-tteok-ke doe-se-yo?", cn: "您怎么称呼？" },
    { ko: "김민준입니다.", roman: "gim-min-jun-im-ni-da.", cn: "我是金敏俊。" },
    { ko: "잘 부탁드립니다.", roman: "jal bu-tak-deu-rim-ni-da.", cn: "请多关照。" },
    { ko: "내일 또 만나요.", roman: "nae-il tto man-na-yo.", cn: "明天再见。" }
  ]
};

/* 文化风俗 */
const KR_CULTURE = [
  { emoji: "🥬", title: "韩餐与泡菜", body: "泡菜（김치）是韩国每餐必备的发酵配菜；石锅拌饭、烤肉、部队锅也极具代表性。用餐前后常说“잘 먹겠습니다 / 잘 먹었습니다”。" },
  { emoji: "🎏", title: "传统节日", body: "설날（春节）吃年糕汤（떡국），추석（中秋）用新粮做松饼（송편）祭拜祖先，重视返乡与团圆。" },
  { emoji: "👘", title: "韩服 한복", body: "韩服线条柔和、色彩素雅，多在节日、婚礼穿着；女性穿 치마（长裙）+ 저고리（短上衣）。" },
  { emoji: "🎬", title: "K-pop 与韩剧", body: "韩国流行音乐与影视全球流行，是了解地道口语与年轻人文化的窗口，也带动韩语学习热潮。" },
  { emoji: "🙇", title: "敬语文化", body: "韩语严格区分 존댓말（敬语）与 반말（非敬语）。对长辈、陌生人或上级需用敬语，关系亲近后才用非敬语。" },
  { emoji: "🔢", title: "年龄与礼节", body: "韩国很看重年龄长幼，初次见面常会问 나이（年龄）以决定用语；长辈先动筷、斟酒时双手持杯是基本礼貌。" }
];

/* B站视频（搜索链接，实时展示最新讲解） */
const KR_VIDEOS = [
  { title: "四十音发音（优校园 / 校园韩语风格）", kw: "韩语四十音 标准发音 教程" },
  { title: "单词拼写与发音法则", kw: "韩语 拼写 发音 法则 连音 紧音화" },
  { title: "语法系统讲解", kw: "韩语 语法 体系 讲解 零基础" },
  { title: "Topik 单词书带背", kw: "TOPIK 单词 书 带背 初级" },
  { title: "日常对话实景", kw: "韩语 日常 对话 实景 练习" }
];

/* =========================================================================
   页面渲染
   ========================================================================= */
const KR_TABS = [
  { id: "sounds", label: "四十音", icon: "🔤" },
  { id: "words", label: "单词", icon: "📚" },
  { id: "grammar", label: "语法", icon: "📐" },
  { id: "quiz", label: "练习", icon: "✍️" },
  { id: "dialogue", label: "对话", icon: "💬" },
  { id: "culture", label: "文化", icon: "🏯" },
  { id: "vtest", label: "词汇量测试", icon: "📊" },
  { id: "book", label: "单词书", icon: "📖" },
  { id: "game", label: "单词游戏", icon: "🎮" }
];

function renderKoreanPage() {
  const ks = krState();
  const main = document.getElementById("app-main");
  main.innerHTML = `
    <div class="kr-page">
      <div class="kr-topbar" id="kr-topbar">
        ${KR_TABS.map(t => `<button class="kr-tab" data-v="${t.id}">${t.icon}<span>${t.label}</span></button>`).join("")}
      </div>
      <div class="kr-content" id="kr-content"></div>
    </div>`;
  const top = main.querySelector("#kr-topbar");
  const content = main.querySelector("#kr-content");
  top.querySelectorAll(".kr-tab").forEach(b => b.onclick = () => {
    ks.cur = b.dataset.v; save(); renderKrContent(content, b.dataset.v); markKrTab(top, b.dataset.v);
  });
  markKrTab(top, ks.cur);
  renderKrContent(content, ks.cur);
}
function markKrTab(top, cur) {
  top.querySelectorAll(".kr-tab").forEach(b => b.classList.toggle("active", b.dataset.v === cur));
}
function renderKrContent(content, view) {
  if (view === "sounds") renderKrSounds(content);
  else if (view === "words") renderKrWords(content);
  else if (view === "grammar") renderKrGrammar(content);
  else if (view === "quiz") renderKrQuiz(content);
  else if (view === "dialogue") renderKrDialogue(content);
  else if (view === "culture") renderKrCulture(content);
  else if (view === "vtest") renderKrVTest(content);
  else if (view === "book") renderKrBook(content);
  else if (view === "game") renderKrGame(content);
}

/* ---------- 四十音 ---------- */
function renderKrSounds(content) {
  const ks = krState();
  const cons = KR_SOUNDS.filter(s => s.t === "c");
  const vows = KR_SOUNDS.filter(s => s.t === "v");
  content.innerHTML = `
    <div class="kr-note">发音标准参考《优校园韩语》等教材。点字符听标准读音、跟写练习，写完后点「检查」会比对模板并给出纠正建议。</div>
    <div class="kr-sec-title">辅音（19）</div>
    <div class="kr-sound-grid" id="kr-cons"></div>
    <div class="kr-sec-title">元音（21）</div>
    <div class="kr-sound-grid" id="kr-vows"></div>
    <div id="kr-sound-detail"></div>`;
  const consEl = content.querySelector("#kr-cons");
  const vowsEl = content.querySelector("#kr-vows");
  const detail = content.querySelector("#kr-sound-detail");
  function cell(s) {
    const learned = ks.learnedSounds.includes(s.ch);
    return `<button class="kr-sound ${learned ? "done" : ""}" data-ch="${s.ch}">${s.ch}<i>${learned ? "✓" : ""}</i></button>`;
  }
  consEl.innerHTML = cons.map(cell).join("");
  vowsEl.innerHTML = vows.map(cell).join("");
  content.querySelectorAll(".kr-sound").forEach(b => b.onclick = () => showSoundDetail(detail, b.dataset.ch));
}
function showSoundDetail(host, ch) {
  const s = KR_SOUNDS.find(x => x.ch === ch);
  const ks = krState();
  const learned = ks.learnedSounds.includes(ch);
  host.innerHTML = `
    <div class="kr-detail">
      <div class="kr-detail-head">
        <div class="kr-big">${ch}</div>
        <div>
          <div class="kr-name">${esc(s.name)} · ${esc(s.roman)}</div>
          <div class="kr-pron">${esc(s.pron)}</div>
        </div>
      </div>
      <div class="kr-row">
        <button class="btn soft sm" data-listen>🔊 听标准读音</button>
        <button class="btn sm ${learned ? "ghost" : ""}" data-learn>${learned ? "已学 ✓" : "标记为已学"}</button>
      </div>
      <div class="kr-tip">✍️ 书写要点：${esc(s.tip)}</div>
      <div class="kr-pad-host"></div>
    </div>`;
  host.querySelector("[data-listen]").onclick = () => speakKO(ch);
  host.querySelector("[data-learn]").onclick = (e) => {
    const i = ks.learnedSounds.indexOf(ch);
    if (i >= 0) ks.learnedSounds.splice(i, 1); else ks.learnedSounds.push(ch);
    save(); renderKrSounds(document.getElementById("app-main").querySelector("#kr-content"));
  };
  mountWritePad(host.querySelector(".kr-pad-host"), ch, s.tip);
  host.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- 单词 ---------- */
function renderKrWords(content) {
  const ks = krState();
  const levels = ["全部", "1", "2", "3", "4", "5", "6"];
  const cats = ["全部"].concat([...new Set(KR_WORDS.map(w => w.cat))]);
  content.innerHTML = `
    <div class="kr-note">单词覆盖 TOPIK 1~6 与日常生活，可点 🔊 听发音；下方自动分解每个音节「由什么组成」，点小 🔊 可听单音节。已学与考级词书联动。</div>
    <div class="kr-spell-box">
      <b>拼写 / 发音法则</b>：韩文以「初声+中声+(终声)」组成一个方块字。相邻音节常发生音变——连音（终声移到下字初声）、紧音化、送气化、腭化、鼻化等。例如 학교(学校) = 학(ㅎ+ㅏ+ㄱ) + 교(ㄱ+ㅛ)，连读近似 [학꾜]。
    </div>
    <div class="kr-filters" id="kr-levels"></div>
    <div class="kr-filters" id="kr-cats"></div>
    <div id="kr-word-list"></div>`;
  const lvEl = content.querySelector("#kr-levels");
  const catEl = content.querySelector("#kr-cats");
  const listEl = content.querySelector("#kr-word-list");
  lvEl.innerHTML = levels.map(l => `<button class="kr-chip" data-l="${l}">${l === "全部" ? "全部等级" : "T" + l}</button>`).join("");
  catEl.innerHTML = cats.map(c => `<button class="kr-chip" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  let curL = "全部", curC = "全部";
  function draw() {
    const arr = KR_WORDS.filter(w => (curL === "全部" || String(w.level) === curL) && (curC === "全部" || w.cat === curC));
    if (!arr.length) { listEl.innerHTML = `<div class="empty">没有匹配的单词</div>`; return; }
    listEl.innerHTML = arr.map(w => {
      const learned = ks.learnedWords.includes(w.ko);
      return `<div class="kr-word ${learned ? "done" : ""}">
        <div class="kr-word-main">
          <div class="kr-word-ko">${esc(w.ko)} <button class="kr-mini" data-spk="${esc(w.ko)}">🔊</button></div>
          <div class="kr-word-roman">${esc(w.roman)}</div>
          <div class="kr-word-cn">${esc(w.cn)}</div>
          <div class="kr-word-meta"><span class="kr-lv">T${w.level}</span><span class="kr-cat">${esc(w.cat)}</span></div>
        </div>
        <div class="kr-comp-wrap">${krComposeHTML(w.ko)}</div>
        <button class="kr-learn-btn" data-learn="${esc(w.ko)}">${learned ? "已学 ✓" : "学"}</button>
      </div>`;
    }).join("");
    listEl.querySelectorAll("[data-spk]").forEach(b => b.onclick = () => speakKO(b.dataset.spk));
    listEl.querySelectorAll("[data-learn]").forEach(b => b.onclick = () => {
      const ko = b.dataset.learn; const i = ks.learnedWords.indexOf(ko);
      if (i >= 0) ks.learnedWords.splice(i, 1); else ks.learnedWords.push(ko);
      save(); draw();
    });
  }
  lvEl.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { curL = b.dataset.l; lvEl.querySelectorAll(".kr-chip").forEach(x => x.classList.toggle("active", x === b)); draw(); });
  catEl.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { curC = b.dataset.c; catEl.querySelectorAll(".kr-chip").forEach(x => x.classList.toggle("active", x === b)); draw(); });
  lvEl.querySelector("[data-l='全部']").classList.add("active");
  catEl.querySelector("[data-c='全部']").classList.add("active");
  draw();
}

/* ---------- 语法 ---------- */
function renderKrGrammar(content) {
  content.innerHTML = `
    <div class="kr-note">常见韩语语法，附说明与例句。点「B站讲解」可搜索最新视频讲解（单词拼写、语法等持续更新）。</div>
    <div class="kr-video-row" id="kr-videos"></div>
    <div id="kr-grammar-list"></div>`;
  content.querySelector("#kr-videos").innerHTML = KR_VIDEOS.map(v =>
    `<div class="kr-video"><span>📺 ${esc(v.title)}</span><button class="btn ghost sm" data-kw="${esc(v.kw)}">B站讲解</button></div>`
  ).join("");
  content.querySelectorAll("[data-kw]").forEach(b => b.onclick = () => {
    window.open("https://search.bilibili.com/all?keyword=" + encodeURIComponent(b.dataset.kw), "_blank");
  });
  content.querySelector("#kr-grammar-list").innerHTML = KR_GRAMMAR.map(g => `
    <div class="kr-grammar">
      <div class="kr-grammar-head"><b>${esc(g.title)}</b><span class="kr-roman">${esc(g.roman)}</span></div>
      <div class="kr-grammar-expl">${esc(g.expl)}</div>
      <div class="kr-ex"><span class="kr-ex-ko">${esc(g.ex.ko)}</span><button class="kr-mini" data-spk="${esc(g.ex.ko)}">🔊</button><span class="kr-ex-cn">${esc(g.ex.cn)}</span></div>
    </div>`).join("");
  content.querySelectorAll("[data-spk]").forEach(b => b.onclick = () => speakKO(b.dataset.spk));
}

/* ---------- 练习（测验） ---------- */
function renderKrQuiz(content) {
  const modes = [
    { id: "listen", label: "词汇抽查（听音选义）" },
    { id: "zh2ko", label: "中译韩" },
    { id: "ko2zh", label: "韩译中" },
    { id: "gram", label: "语法练习" }
  ];
  content.innerHTML = `
    <div class="kr-note">四类推题自动从词库/语法库生成，含词汇抽查、语法、中译韩、韩译中。</div>
    <div class="kr-filters" id="kr-modes"></div>
    <div id="kr-quiz-box"></div>`;
  const modeEl = content.querySelector("#kr-modes");
  const box = content.querySelector("#kr-quiz-box");
  modeEl.innerHTML = modes.map(m => `<button class="kr-chip" data-m="${m.id}">${esc(m.label)}</button>`).join("");
  modeEl.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
    modeEl.querySelectorAll(".kr-chip").forEach(x => x.classList.toggle("active", x === b));
    startQuiz(box, b.dataset.m);
  });
}
function buildQuizPool(mode) {
  const pool = [];
  if (mode === "listen") {
    KR_WORDS.forEach(w => {
      const opts = shuffle(KR_WORDS.filter(x => x.ko !== w.ko).map(x => x.cn)).slice(0, 3);
      opts.push(w.cn); shuffle(opts);
      pool.push({ audio: w.ko, q: "🔊 听发音，选择正确意思", opts, ans: w.cn });
    });
  } else if (mode === "zh2ko") {
    KR_WORDS.forEach(w => {
      const opts = shuffle(KR_WORDS.filter(x => x.ko !== w.ko).map(x => x.ko)).slice(0, 3);
      opts.push(w.ko); shuffle(opts);
      pool.push({ q: `「${w.cn}」的韩语是？`, opts, ans: w.ko });
    });
  } else if (mode === "ko2zh") {
    KR_WORDS.forEach(w => {
      const opts = shuffle(KR_WORDS.filter(x => x.ko !== w.ko).map(x => x.cn)).slice(0, 3);
      opts.push(w.cn); shuffle(opts);
      pool.push({ q: `「${w.ko}」的意思是？`, opts, ans: w.cn });
    });
  } else if (mode === "gram") {
    KR_GRAMMAR.forEach(g => {
      const others = shuffle(KR_GRAMMAR.filter(x => x.id !== g.id).map(x => x.expl)).slice(0, 3);
      const opts = others.concat([g.expl]); shuffle(opts);
      pool.push({ q: `语法「${g.title}」表示什么？<br><span class="kr-roman">${esc(g.roman)}</span>`, opts, ans: g.expl });
    });
  }
  return shuffle(pool);
}
function startQuiz(box, mode) {
  const ks = krState();
  const all = buildQuizPool(mode);
  const qs = all.slice(0, 10);
  let idx = 0, score = 0, wrong = 0;
  function render() {
    if (idx >= qs.length) {
      const best = ks.quiz.best[mode] || 0;
      if (score > best) ks.quiz.best[mode] = score;
      ks.quiz.last = { mode, score, total: qs.length, time: Date.now() };
      save();
      box.innerHTML = `<div class="kr-quiz-end">
        <div class="kr-quiz-score">${score} / ${qs.length}</div>
        <div class="kr-quiz-sub">${score >= qs.length * 0.8 ? "太棒了 🎉" : score >= qs.length * 0.6 ? "不错，继续加油 💪" : "多练几遍会更熟 📖"}</div>
        <button class="btn" data-again>再来一组</button></div>`;
      box.querySelector("[data-again]").onclick = () => startQuiz(box, mode);
      return;
    }
    const q = qs[idx];
    box.innerHTML = `
      <div class="kr-quiz-prog">第 ${idx + 1} / ${qs.length} 题 · 得分 ${score}</div>
      <div class="kr-quiz-q">${q.q}${q.audio ? ` <button class="kr-mini" data-aud>🔊</button>` : ""}</div>
      <div class="kr-quiz-opts" id="kr-opts"></div>`;
    if (q.audio) box.querySelector("[data-aud]").onclick = () => speakKO(q.audio);
    const optEl = box.querySelector("#kr-opts");
    optEl.innerHTML = q.opts.map(o => `<button class="kr-opt">${esc(o)}</button>`).join("");
    optEl.querySelectorAll(".kr-opt").forEach(b => b.onclick = () => {
      const correct = b.textContent.trim() === String(q.ans).trim();
      if (correct) { score++; b.classList.add("ok"); }
      else { wrong++; b.classList.add("bad"); optEl.querySelectorAll(".kr-opt").forEach(x => { if (x.textContent.trim() === String(q.ans).trim()) x.classList.add("ok"); }); }
      optEl.querySelectorAll(".kr-opt").forEach(x => x.disabled = true);
      setTimeout(() => { idx++; render(); }, 700);
    });
  }
  render();
}

/* ---------- 对话 ---------- */
function renderKrDialogue(content) {
  const ks = krState();
  const scenes = Object.keys(KR_DIALOGUES);
  content.innerHTML = `
    <div class="kr-note">切换场景，下方对话会随之改变。每行可点 🔊 听标准发音。</div>
    <div class="kr-filters" id="kr-scenes"></div>
    <div id="kr-dlg"></div>`;
  const sceneEl = content.querySelector("#kr-scenes");
  const dlgEl = content.querySelector("#kr-dlg");
  sceneEl.innerHTML = scenes.map(s => `<button class="kr-chip" data-s="${esc(s)}">${esc(s)}</button>`).join("");
  function draw(scene) {
    ks.dialogueScene = scene; save();
    const lines = KR_DIALOGUES[scene];
    dlgEl.innerHTML = `<div class="kr-dlg-head">📍 ${esc(scene)} · 共 ${lines.length} 句</div>` + lines.map((l, i) => `
      <div class="kr-bubble ${i % 2 ? "me" : ""}">
        <div class="kr-bub-ko">${esc(l.ko)} <button class="kr-mini" data-spk="${esc(l.ko)}">🔊</button></div>
        <div class="kr-bub-roman">${esc(l.roman)}</div>
        <div class="kr-bub-cn">${esc(l.cn)}</div>
      </div>`).join("");
    dlgEl.querySelectorAll("[data-spk]").forEach(b => b.onclick = () => speakKO(b.dataset.spk));
  }
  sceneEl.querySelectorAll("[data-s]").forEach(b => b.onclick = () => {
    sceneEl.querySelectorAll(".kr-chip").forEach(x => x.classList.toggle("active", x === b));
    draw(b.dataset.s);
  });
  const init = ks.dialogueScene && KR_DIALOGUES[ks.dialogueScene] ? ks.dialogueScene : scenes[0];
  sceneEl.querySelector(`[data-s='${init}']`).classList.add("active");
  draw(init);
}

/* ---------- 文化 ---------- */
function renderKrCulture(content) {
  content.innerHTML = `
    <div class="kr-note">了解韩国文化风俗，配合语言学习更地道。</div>
    <div class="kr-culture-grid">
      ${KR_CULTURE.map(c => `<div class="kr-culture"><div class="kr-culture-emoji">${c.emoji}</div><b>${esc(c.title)}</b><div class="kr-culture-body">${esc(c.body)}</div></div>`).join("")}
    </div>`;
}

/* ---------- 手写画板 + 模板比对纠正 ---------- */
function mountWritePad(host, ch, tip) {
  host.innerHTML = `
    <div class="kr-pad-wrap">
      <canvas class="kr-pad" width="320" height="320"></canvas>
      <div class="kr-pad-actions">
        <button class="btn soft sm" data-listen>🔊 听发音</button>
        <button class="btn sm" data-check>✓ 检查</button>
        <button class="btn ghost sm" data-clear>↺ 清除</button>
      </div>
      <div class="kr-pad-fb" data-fb></div>
    </div>`;
  const canvas = host.querySelector(".kr-pad");
  const ctx = canvas.getContext("2d");
  function drawGuide() {
    ctx.clearRect(0, 0, 320, 320);
    ctx.fillStyle = "#fce7f3";
    ctx.font = "240px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(ch, 160, 170);
  }
  drawGuide();
  let drawing = false;
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (320 / r.width), y: (t.clientY - r.top) * (320 / r.height) };
  }
  function start(e) { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    const p = pos(e);
    ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#db2777";
    ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault();
  }
  function end() { drawing = false; }
  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  host.querySelector("[data-listen]").onclick = () => speakKO(ch);
  host.querySelector("[data-clear]").onclick = () => { drawGuide(); host.querySelector("[data-fb]").textContent = ""; host.querySelector("[data-fb]").className = "kr-pad-fb"; };
  host.querySelector("[data-check]").onclick = () => {
    const iou = krCompareCanvas(canvas, ch);
    const fb = host.querySelector("[data-fb]");
    if (iou > 0.16) {
      fb.innerHTML = "✅ 写得很接近，继续保持！";
      fb.className = "kr-pad-fb ok";
    } else {
      fb.innerHTML = "✍️ 还不太像，注意纠正：" + esc(tip || "先观察上方标准字形，再按顺序描一遍。");
      fb.className = "kr-pad-fb bad";
    }
  };
}
function krCompareCanvas(canvas, ch) {
  const off = document.createElement("canvas"); off.width = 320; off.height = 320;
  const o = off.getContext("2d");
  o.fillStyle = "#000"; o.font = "240px sans-serif"; o.textAlign = "center"; o.textBaseline = "middle";
  o.fillText(ch, 160, 170);
  const a = canvas.getContext("2d").getImageData(0, 0, 320, 320).data;
  const b = o.getImageData(0, 0, 320, 320).data;
  let inter = 0, uni = 0;
  for (let i = 3; i < a.length; i += 4) {
    const ca = a[i] > 40, cb = b[i] > 40;
    if (ca || cb) uni++;
    if (ca && cb) inter++;
  }
  return uni ? inter / uni : 0;
}

/* ---------- 词汇量测试 ---------- */
function renderKrVTest(content) {
  const ks = krState();
  ks.vtest = ks.vtest || { history: [] };
  content.innerHTML = `
    <div class="kr-note">选择题形式估算词汇量，难度可选 TOPIK I（初级） / TOPIK II（中高级）。测完给出估算词汇量与水平标签。</div>
    <div class="kr-filters" id="kr-diff"></div>
    <div id="kr-vtest-box"></div>`;
  const diffEl = content.querySelector("#kr-diff");
  const box = content.querySelector("#kr-vtest-box");
  let diff = "I";
  const drawDiff = () => {
    diffEl.innerHTML = [["I", "TOPIK I（初级）"], ["II", "TOPIK II（中高级）"]]
      .map(d => `<button class="kr-chip ${d[0] === diff ? "active" : ""}" data-d="${d[0]}">${d[1]}</button>`).join("");
    diffEl.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { diff = b.dataset.d; drawDiff(); });
  };
  drawDiff();
  box.innerHTML = `<button class="btn" id="kr-start">开始测词（20 题）</button>
    ${ks.vtest.history.length ? `<div class="kr-note">最近一次：${ks.vtest.history[0].est} 词 · ${ks.vtest.history[0].label}（${ks.vtest.history[0].date}）</div>` : ""}`;
  box.querySelector("#kr-start").onclick = () => startVTest(box, diff);
}
function startVTest(box, diff) {
  const ks = krState();
  const pool = KR_WORDS.filter(w => diff === "I" ? w.level <= 2 : w.level >= 3);
  const qs = shuffle(pool).slice(0, Math.min(20, pool.length));
  let idx = 0, score = 0;
  function render() {
    if (idx >= qs.length) {
      const ratio = score / qs.length;
      const nominal = diff === "I" ? 2000 : 6000;
      const est = Math.max(qs.length, Math.round(nominal * ratio));
      const label = est >= 6000 ? "母语级 🏆" : est >= 3000 ? "高级 🌟" : est >= 1000 ? "中级 💪" : "初级 🌱";
      ks.vtest.history.unshift({ est, label, diff, date: lm_today ? lm_today() : new Date().toISOString().slice(0, 10) });
      ks.vtest.history = ks.vtest.history.slice(0, 5);
      save();
      box.innerHTML = `<div class="kr-test-result">
        <div class="kr-quiz-score">约 ${est} 词</div>
        <div class="kr-level-tag">${label}</div>
        <div class="kr-quiz-sub">正确 ${score} / ${qs.length} · ${diff === "I" ? "TOPIK I 区间" : "TOPIK II 区间"}</div>
        <button class="btn" data-again>再测一次</button></div>`;
      box.querySelector("[data-again]").onclick = () => { idx = 0; score = 0; renderKrVTest(document.getElementById("kr-content")); };
      return;
    }
    const q = qs[idx];
    const opts = shuffle(KR_WORDS.filter(x => x.ko !== q.ko).map(x => x.ko)).slice(0, 3);
    opts.push(q.ko); shuffle(opts);
    box.innerHTML = `
      <div class="kr-quiz-prog">第 ${idx + 1} / ${qs.length} 题 · 正确 ${score}</div>
      <div class="kr-quiz-q">「${esc(q.cn)}」的韩语是？ <button class="kr-mini" data-aud>🔊</button></div>
      <div class="kr-quiz-opts" id="kr-opts"></div>`;
    box.querySelector("[data-aud]").onclick = () => speakKO(q.ko);
    const optEl = box.querySelector("#kr-opts");
    optEl.innerHTML = opts.map(o => `<button class="kr-opt">${esc(o)}</button>`).join("");
    optEl.querySelectorAll(".kr-opt").forEach(b => b.onclick = () => {
      const correct = b.textContent.trim() === q.ko;
      if (correct) { score++; b.classList.add("ok"); }
      else { b.classList.add("bad"); optEl.querySelectorAll(".kr-opt").forEach(x => { if (x.textContent.trim() === q.ko) x.classList.add("ok"); }); }
      optEl.querySelectorAll(".kr-opt").forEach(x => x.disabled = true);
      setTimeout(() => { idx++; render(); }, 650);
    });
  }
  render();
}

/* ---------- 单词书 ---------- */
function renderKrBook(content) {
  const ks = krState();
  ks.book = ks.book || { learned: [], favs: [] };
  const words = KR_WORDS;
  const unitSize = 20;
  const units = Math.ceil(words.length / unitSize);
  content.innerHTML = `
    <div class="kr-note">入门词库按单元分组（每单元 20 词），卡片可听音、收藏到生词本、标记已学。底部显示学习进度。</div>
    <div class="kr-filters" id="kr-units"></div>
    <div id="kr-book-box"></div>
    <div class="kr-book-fav" id="kr-fav"><b>⭐ 生词本（${ks.book.favs.length}）</b><div id="kr-fav-list"></div></div>`;
  const unitEl = content.querySelector("#kr-units");
  const box = content.querySelector("#kr-book-box");
  let curUnit = 0;
  const drawUnits = () => {
    unitEl.innerHTML = Array.from({ length: units }, (_, i) =>
      `<button class="kr-chip ${i === curUnit ? "active" : ""}" data-u="${i}">第 ${i + 1} 单元</button>`).join("");
    unitEl.querySelectorAll("[data-u]").forEach(b => b.onclick = () => { curUnit = +b.dataset.u; drawUnits(); drawBook(); });
  };
  const drawBook = () => {
    const slice = words.slice(curUnit * unitSize, curUnit * unitSize + unitSize);
    box.innerHTML = slice.map(w => {
      const learned = ks.book.learned.includes(w.ko);
      const fav = ks.book.favs.includes(w.ko);
      return `<div class="kr-card-book ${learned ? "done" : ""}">
        <div class="kr-cb-head"><b>${esc(w.ko)}</b><button class="kr-mini" data-say="${esc(w.ko)}">🔊</button></div>
        <div class="kr-roman">${esc(w.roman || "")}</div>
        <div class="kr-cb-cn">${esc(w.cn)} <span class="kr-lv">L${w.level}</span></div>
        <div class="kr-cb-acts">
          <button class="kr-mini ${fav ? "on" : ""}" data-fav="${esc(w.ko)}">${fav ? "⭐已藏" : "☆收藏"}</button>
          <button class="kr-mini ${learned ? "on" : ""}" data-learn="${esc(w.ko)}">${learned ? "✓已学" : "标记已学"}</button>
        </div></div>`;
    }).join("");
    box.querySelectorAll("[data-say]").forEach(b => b.onclick = () => speakKO(b.dataset.say));
    box.querySelectorAll("[data-fav]").forEach(b => b.onclick = () => {
      const ko = b.dataset.fav; const i = ks.book.favs.indexOf(ko);
      if (i >= 0) ks.book.favs.splice(i, 1); else ks.book.favs.push(ko);
      save(); drawBook(); drawFav();
    });
    box.querySelectorAll("[data-learn]").forEach(b => b.onclick = () => {
      const ko = b.dataset.learn; const i = ks.book.learned.indexOf(ko);
      if (i >= 0) ks.book.learned.splice(i, 1); else ks.book.learned.push(ko);
      save(); drawBook(); drawProg();
    });
  };
  const drawFav = () => {
    const list = content.querySelector("#kr-fav-list");
    if (!ks.book.favs.length) { list.innerHTML = `<div class="empty">还没有收藏的生词</div>`; return; }
    list.innerHTML = ks.book.favs.map(ko => {
      const w = words.find(x => x.ko === ko);
      return `<span class="kr-chip on" data-say="${esc(ko)}">${esc(ko)}${w ? " · " + esc(w.cn) : ""} 🔊</span>`;
    }).join("");
    list.querySelectorAll("[data-say]").forEach(b => b.onclick = () => speakKO(b.dataset.say));
  };
  const progEl = document.createElement("div");
  const drawProg = () => {
    const p = Math.round(ks.book.learned.length / words.length * 100);
    content.querySelector("#kr-fav").insertAdjacentElement("afterend", progEl);
    progEl.className = "kr-book-prog";
    progEl.innerHTML = `学习进度：已学 ${ks.book.learned.length} / ${words.length}（${p}%）`;
  };
  drawUnits(); drawBook(); drawFav(); drawProg();
}

/* ---------- 单词小游戏 ---------- */
function renderKrGame(content) {
  const ks = krState();
  content.innerHTML = `
    <div class="kr-note">两种模式每轮 10 题，答完显示得分与用时。</div>
    <div class="kr-filters" id="kr-gmodes"></div>
    <div id="kr-game-box"></div>`;
  const modeEl = content.querySelector("#kr-gmodes");
  const box = content.querySelector("#kr-game-box");
  modeEl.innerHTML = [["spell", "拼写挑战（听音拼词）"], ["match", "词义配对（韩连中）"]]
    .map(m => `<button class="kr-chip" data-m="${m[0]}">${m[1]}</button>`).join("");
  modeEl.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
    modeEl.querySelectorAll(".kr-chip").forEach(x => x.classList.toggle("active", x === b));
    startGame(box, b.dataset.m);
  });
}
function startGame(box, mode) {
  const qs = shuffle(KR_WORDS).slice(0, 10);
  let idx = 0, score = 0; const t0 = Date.now();
  function render() {
    if (idx >= qs.length) {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      box.innerHTML = `<div class="kr-test-result">
        <div class="kr-quiz-score">${score} / ${qs.length}</div>
        <div class="kr-quiz-sub">用时 ${sec}s ${score >= 8 ? "🎉 厉害" : score >= 6 ? "💪 不错" : "📖 多练练"}</div>
        <button class="btn" data-again>再来一局</button></div>`;
      box.querySelector("[data-again]").onclick = () => renderKrGame(document.getElementById("kr-content"));
      return;
    }
    const q = qs[idx];
    if (mode === "spell") {
      box.innerHTML = `
        <div class="kr-quiz-prog">第 ${idx + 1} / ${qs.length} 题 · 得分 ${score}</div>
        <div class="kr-quiz-q">听发音，写出韩语单词 <button class="kr-mini" data-aud>🔊 播放</button></div>
        <div class="kr-roman">提示：${esc(q.cn)}</div>
        <input class="kr-game-input" id="kr-ans" placeholder="输入韩语拼写" autocomplete="off" />
        <button class="btn" id="kr-sub">提交</button>`;
      box.querySelector("[data-aud]").onclick = () => speakKO(q.ko);
      const inp = box.querySelector("#kr-ans"); inp.focus();
      const sub = () => {
        const ok = inp.value.trim().replace(/\s/g, "") === q.ko;
        if (ok) { score++; krToast("正确 ✅"); } else krToast("正确答案：" + q.ko);
        idx++; render();
      };
      box.querySelector("#kr-sub").onclick = sub;
      inp.onkeydown = e => { if (e.key === "Enter") sub(); };
    } else {
      const opts = shuffle(KR_WORDS.filter(x => x.ko !== q.ko).map(x => x.cn)).slice(0, 3);
      opts.push(q.cn); shuffle(opts);
      box.innerHTML = `
        <div class="kr-quiz-prog">第 ${idx + 1} / ${qs.length} 题 · 得分 ${score}</div>
        <div class="kr-quiz-q">「${esc(q.ko)}」的意思是？ <button class="kr-mini" data-aud>🔊</button></div>
        <div class="kr-quiz-opts" id="kr-opts"></div>`;
      box.querySelector("[data-aud]").onclick = () => speakKO(q.ko);
      const optEl = box.querySelector("#kr-opts");
      optEl.innerHTML = opts.map(o => `<button class="kr-opt">${esc(o)}</button>`).join("");
      optEl.querySelectorAll(".kr-opt").forEach(b => b.onclick = () => {
        const correct = b.textContent.trim() === q.cn;
        if (correct) { score++; b.classList.add("ok"); } else { b.classList.add("bad"); optEl.querySelectorAll(".kr-opt").forEach(x => { if (x.textContent.trim() === q.cn) x.classList.add("ok"); }); }
        optEl.querySelectorAll(".kr-opt").forEach(x => x.disabled = true);
        setTimeout(() => { idx++; render(); }, 650);
      });
    }
  }
  render();
}

/* ---------- 小工具 ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
