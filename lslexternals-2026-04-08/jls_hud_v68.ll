// ================= JLS HUD v68 — PRESENCE AMPLIFICATION =================

// ================= ENDPOINTS =================
string API_MAIN = "https://jigsawlodgesociety.com/api/event";
string API_FALLBACK = "http://89.167.94.250:3000/api/event";

string API;
integer usingFallback = FALSE;
integer DEBUG = TRUE;

// ================= STATE =================
integer level = 0;
integer rituals = 0;
integer bonds = 0;
integer watchers = 0;
integer pentacles = 0;

string activeHoney = "";
integer honeyExpireTime = 0;

integer ritualProgress = 0;
string currentOrder = "neutral";
integer surgeReady = FALSE;

// ================= ICON =================
string PENTACLE_ICON = "⟐";

// ================= BOOT =================
integer bootIndex = 0;
float bootTimer = 0.0;
integer bootDone = FALSE;

list bootDurations = [
    1.0,  // ambient
    1.0,
    0.8,  // acceleration
    0.8,
    1.2,  // "YOU ARE SEEN" linger
    0.8,
    1.0,
    0.8,
    1.0,
    1.2,  // RECOGNIZED linger
    0.8,
    1.2,  // IDENTITY LOCK linger
    1.0,
    1.5   // ENTER (final hold)
];

list bootFrames = [
    "∴ ∴ ∴\n⋮⋮⋮⋮⋮\n∴ ∴ ∴",
    "⌁⌁⌁⌁⌁\n◉ ◉ ◉\n⌁⌁⌁⌁⌁",
    "DYN_CORE",
    "◉◉◉◉◉\n⌬⌬⌬⌬⌬\n◉◉◉◉◉",
    "⋮⋮⋮⋮⋮\nYOU ARE SEEN\n⋮⋮⋮⋮⋮",
    "DYN_SIGIL",
    "⌁⌁⌁\nPATTERN DETECTED\n⌁⌁⌁",
    "DYN_INTRUSION",
    "⟁⟁⟁⟁⟁\nYOU RETURN\n⟁⟁⟁⟁⟁",
    "⋮⋮⋮⋮⋮\n▵ RECOGNIZED ▵\n⋮⋮⋮⋮⋮",
    "⛧⌬⛧⌬⛧\n⌁⌁⌁⌁⌁\n⛧⌬⛧⌬⛧",
    "◉◉◉◉◉\nIDENTITY LOCK\n◉◉◉◉◉",
    "DYN_FINAL",
    "◆◆◆\nENTER\n◆◆◆"
];

list symbols = ["∴","⟁","⌬","◉","⋮","⌁","⛧","◈","✶","✧","⟐","⌭"];
integer symbolIndex = 0;

// ================= NETWORK =================
key activeRequest = NULL_KEY;
integer requestPending = FALSE;
integer requestSentUnix = 0;
integer requestRetryCount = 0;
integer errorNotified = FALSE;
integer nextRequestUnix = 0;

integer REQUEST_TIMEOUT = 6;
integer MAX_RETRIES = 3;
integer REQUEST_INTERVAL = 2;

// ================= HELPERS =================
debugSay(string msg)
{
    if (DEBUG) llOwnerSay(msg);
}

integer clampInt(integer v, integer minV, integer maxV)
{
    if (v < minV) return minV;
    if (v > maxV) return maxV;
    return v;
}

string nextSymbol()
{
    integer len = llGetListLength(symbols);
    symbolIndex = (symbolIndex + 1) % len;
    return llList2String(symbols, symbolIndex);
}

// ================= PROGRESS =================
string progressBar(integer pct)
{
    integer i;
    integer total = 12;
    integer filled = (clampInt(pct,0,100) * total) / 100;

    string bar = "";

    for (i = 0; i < total; i++)
    {
        if (i < filled) bar += "█";
        else bar += "░";
    }

    if (pct >= 90)
    {
        if (llFrand(1.0) > 0.6)
        {
            integer pos = total - 1;
            bar = llDeleteSubString(bar, pos, pos) + "▓";
        }
    }

    return bar;
}

// ================= TIME =================
string twoDigits(integer v)
{
    if (v < 10) return "0" + (string)v;
    return (string)v;
}

string honeyTimeText()
{
    integer now = llGetUnixTime();
    integer remaining = 0;

    if (honeyExpireTime > now)
        remaining = honeyExpireTime - now;

    return twoDigits(remaining / 60) + ":" + twoDigits(remaining % 60);
}

// ================= JSON =================
integer safeInt(string body, list path, integer fallback)
{
    string v = llJsonGetValue(body, path);
    if (v == "" || v == JSON_INVALID) return fallback;
    return (integer)v;
}

string safeString(string body, list path, string fallback)
{
    string v = llJsonGetValue(body, path);
    if (v == "" || v == JSON_INVALID) return fallback;
    return v;
}

// ================= REQUEST =================
sendHudRequest()
{
    string body = llList2Json(JSON_OBJECT, [
        "avatar",(string)llGetOwner(),
        "object",(string)llGetKey(),
        "action","hud_tick"
    ]);

    activeRequest = llHTTPRequest(
        API,
        [HTTP_METHOD,"POST",HTTP_MIMETYPE,"application/json"],
        body
    );

    requestPending = TRUE;
    requestSentUnix = llGetUnixTime();
}

// ================= PROCESS =================
processResponseBody(string body)
{
    level = safeInt(body, ["state","level"], level);
    rituals = safeInt(body, ["state","rituals"], rituals);
    bonds = safeInt(body, ["state","bonds"], bonds);
    watchers = safeInt(body, ["state","watchers"], watchers);
    pentacles = safeInt(body, ["state","pentacles"], pentacles);
    ritualProgress = safeInt(body, ["state","ritual_progress"], ritualProgress);

    activeHoney = safeString(body, ["state","honey"], activeHoney);
    honeyExpireTime = safeInt(body, ["state","honey_expire"], honeyExpireTime);
    surgeReady = safeInt(body, ["state","surge_ready"], surgeReady);
}

// ================= RENDER =================
renderHUD()
{
    string display =
        "▵ JIGSAW LODGE SOCIETY ▵\n"
        + "Lvl. " + (string)level
        + " • △" + (string)rituals
        + " • ⛓" + (string)bonds
        + " • 👁" + (string)watchers + "\n"
        + "◆" + progressBar(ritualProgress) + "◆\n"
        + "🍯 " + honeyTimeText()
        + "        " + PENTACLE_ICON + " " + (string)pentacles
        + "        ⚡ " + (string)surgeReady + "\n"
        + nextSymbol();

    llSetText(display, <1,1,1>, 1.0);
}

// ================= FAILURE =================
integer markRequestFailure(string reason)
{
    requestPending = FALSE;
    activeRequest = NULL_KEY;
    requestRetryCount++;

    if (requestRetryCount == 1 && !usingFallback)
    {
        usingFallback = TRUE;
        API = API_FALLBACK;
        return TRUE;
    }

    if (requestRetryCount < MAX_RETRIES)
    {
        nextRequestUnix = llGetUnixTime() + 1;
        return TRUE;
    }

    if (!errorNotified)
    {
        llOwnerSay("JLS HUD sync unavailable.");
        errorNotified = TRUE;
    }

    return FALSE;
}

// ================= MAIN =================
default
{
    state_entry()
    {
        API = API_MAIN;
        llSetTimerEvent(0.5);
    }

    timer()
    {
        integer now = llGetUnixTime();

        if (!bootDone)
        {
            bootTimer += 0.5;

            float duration = llList2Float(bootDurations, bootIndex);

            if (bootTimer >= duration)
            {
                bootIndex++;
                bootTimer = 0.0;

                if (bootIndex >= llGetListLength(bootFrames))
                {
                    bootDone = TRUE;
                    llOwnerSay("JLS HUD boot complete.");
                    bootIndex = llGetListLength(bootFrames) - 1;
                }
            }

            llSetText(llList2String(bootFrames, bootIndex), <1,1,1>, 1.0);
            return;
        }

        if (requestPending)
        {
            if ((now - requestSentUnix) > REQUEST_TIMEOUT)
                markRequestFailure("timeout");
        }
        else if (now >= nextRequestUnix)
        {
            sendHudRequest();
            nextRequestUnix = now + REQUEST_INTERVAL;
        }

        renderHUD();
    }

    http_response(key id, integer status, list meta, string body)
    {
        if (id != activeRequest) return;

        requestPending = FALSE;
        activeRequest = NULL_KEY;

        if (status != 200)
        {
            markRequestFailure("http");
            return;
        }

        if (llStringLength(body) == 0 || llJsonValueType(body, []) == JSON_INVALID)
        {
            markRequestFailure("json");
            return;
        }

        processResponseBody(body);

        requestRetryCount = 0;
        errorNotified = FALSE;

        renderHUD();
    }

    changed(integer change)
    {
        if (change & CHANGED_OWNER) llResetScript();
    }

    on_rez(integer start_param)
    {
        llResetScript();
    }
}
