const fetch = require("node-fetch");
const { insertHeroes } = require("../server/models/hero_model.js");
const { getCache, client } = require("./models/redis");
async function verifyMember (req, res, next) {
  const { name, password } = req.headers;
  // check if there are name and password in request header
  if (name && password) {
    const user = {
      name,
      password
    };
    await fetch("https://hahow-recruit.herokuapp.com/auth", {
      method: "POST",
      body: JSON.stringify(user),
      headers: { "Content-Type": "application/json" }
    })
      .then((reply) => {
      // authorized member
        if (reply.status === 200) {
          req.headers.member = true;
        } else {
        // provided invalid name or password;
          req.headers.member = false;
        }
      });
    next();
  } else {
    // not a member
    req.headers.member = false;
    next();
  }
}

async function getApiData () {
  const result = await fetch("https://hahow-recruit.herokuapp.com/heroes", {
    method: "GET"
  });
  const resultData = await result.json();
  // in case there is unwanted data format of returned api data
  if (resultData.length && resultData[0].id) {
    return resultData;
  } else {
    console.log("The heroes data format is incorrect");
    return "wrong data format";
  }
}

async function insertApiData () {
  try {
    let apiData;
    do {
      apiData = await getApiData();
    } while (apiData === "wrong data format");
    // insert into mysql
    const heroesData = [];
    const apiHeroIdArr = [];
    const today = new Date();
    const date = today.toISOString().substring(0, 10);
    for (const i in apiData) {
      const heroData = [];
      heroData.push(apiData[i].id);
      heroData.push(apiData[i].name);
      heroData.push(apiData[i].image);
      heroData.push(date);
      heroesData.push(heroData);
      // for profile api
      apiHeroIdArr.push(apiData[i].id);
    }
    // iterate apiHeroIdArr and get profile for each hero
    const heroProfiles = await getHerosProfile(apiHeroIdArr);
    await insertHeroes(heroesData, heroProfiles);
  } catch (err) {
    console.log("insert DB error");
  }
}

async function getHerosProfile (arr) {
  const today = new Date();
  const date = today.toISOString().substring(0, 10);
  const heroProfiles = [];
  for (let i = 0; i < arr.length; i++) {
    const heroProfile = [];
    heroProfile.push(arr[i]);
    const result = await fetch(`https://hahow-recruit.herokuapp.com/heroes/${arr[i]}/profile`, {
      method: "GET"
    });
    const profileData = await result.json();
    // in case there is unwanted data format of returned api data
    if (profileData.str) {
      heroProfile.push(profileData.str);
      heroProfile.push(profileData.int);
      heroProfile.push(profileData.agi);
      heroProfile.push(profileData.luk);
      heroProfile.push(date);
      heroProfiles.push(heroProfile);
    } else {
      i--;
    }
  }
  return heroProfiles;
}

// ??????rate limiter??????10???????????????10???api
async function rateLimiter (req, res, next) {
  const clientip = req.connection.remoteAddress;
  const value = await getCache(clientip);
  // 10????????????????????????
  if (value === null) {
    const data = {
      count: 1,
      time: new Date().getTime()
    };
    client.setex(clientip, 10, JSON.stringify(data));
    next();
    return;
  }
  // 10?????????????????????api
  const parsedValue = JSON.parse(value);
  // ??????api?????????10?????????????????????????????????????????????
  if (parsedValue.count >= 10) {
    const time = JSON.parse(value).time;
    const expiredTime = time + 10000;
    const clock = new Date(expiredTime);
    const message = {
      message: `??????${clock}?????????`
    };
    res.status(429).send(message);
  } else {
    // ??????api?????????10??????????????????api??????
    parsedValue.count += 1;
    client.set(clientip, JSON.stringify(parsedValue), "KEEPTTL");
    next();
  }
}

module.exports = {
  verifyMember,
  getApiData,
  insertApiData,
  rateLimiter
};
