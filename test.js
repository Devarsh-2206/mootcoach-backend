const text1 = "[Justice Menon]";
const match1 = text1.match(/^\[(.*?)\]\s*(.*)/s);
console.log(match1 ? `match1: ${match1[1]} | ${match1[2]}` : 'no match');

const text2 = "[Justice Menon] Counsel";
const match2 = text2.match(/^\[(.*?)\]\s*(.*)/s);
console.log(match2 ? `match2: ${match2[1]} | ${match2[2]}` : 'no match');

const text3 = "[Justice ";
const match3 = text3.match(/^\[(.*?)\]\s*(.*)/s);
console.log(match3 ? `match3: ${match3[1]} | ${match3[2]}` : 'no match');
