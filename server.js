"use strict";

const http = require("http");
const { Pool } = require("pg");
const WebSocket = require("ws");
const { URL } = require("url");

const PORT = 3000;
const WS_PORT = 3010;

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

const wss = new WebSocket.Server({ port: WS_PORT });

function now(){ return Math.floor(Date.now()/1000); }

function baseXP(n){
  if(n<=1) return 5;
  if(n==2) return 10;
  if(n==3) return 14;
  if(n==4) return 17;
  return 19;
}

async function handleEvent(body){
  const avatar = body.avatar;

  await pool.query(
    "INSERT INTO players(avatar) VALUES($1) ON CONFLICT DO NOTHING",
    [avatar]
  );

  const res = await pool.query("SELECT * FROM players WHERE avatar=$1",[avatar]);
  const p = res.rows[0];

  return {
    state:{
      level: Math.floor(Math.pow(p.xp/250,0.606)),
      rituals: p.rituals,
      bonds: p.bonds,
      watchers: p.watchers,
      pentacles: p.pentacles,
      honey: p.honey,
      honey_expire: p.honey_expire,
      surge_ready: p.stacks>=2 ? 1:0,
      ritual_progress: p.xp % 100
    },
    event:{}
  };
}

async function world(){
  const players = (await pool.query(
    "SELECT avatar,xp FROM players ORDER BY xp DESC LIMIT 25"
  )).rows;

  const events = (await pool.query(
    "SELECT type,avatar,meta,ts FROM events ORDER BY ts DESC LIMIT 25"
  )).rows;

  return { players, events };
}

const server = http.createServer((req,res)=>{
  const url = new URL(req.url,"http://localhost");

  if(req.method==="GET" && url.pathname==="/api/world"){
    world().then(d=>res.end(JSON.stringify(d)));
    return;
  }

  if(req.method==="POST" && url.pathname==="/api/event"){
    let body="";
    req.on("data",d=>body+=d);
    req.on("end", async ()=>{
      let out = await handleEvent(JSON.parse(body||"{}"));
      res.end(JSON.stringify(out));
    });
    return;
  }

  res.end("ok");
});

server.listen(PORT,()=>console.log("HTTP LIVE"));
