// JLS HUD Minimal IO v1
// Purpose: the smallest possible HUD that only sends input to the backend
// and renders the backend state it receives back.

string API_MAIN = "https://jigsawlodgesociety.com/api/event";
string API_FALLBACK = "http://89.167.94.250:3000/api/event";

integer USE_SIGNING = FALSE;
string SHARED_TOKEN = "";
string SIGNING_SECRET = "";

integer DEBUG = TRUE;
integer REQUEST_INTERVAL = 2;
integer REQUEST_TIMEOUT = 6;
integer MAX_RETRIES = 3;

string apiUrl = "";
integer usingFallback = FALSE;

integer level = 0;
integer rituals = 0;
integer bonds = 0;
integer watchers = 0;
integer pentacles = 0;
integer ritualProgress = 0;
integer honeyExpireTime = 0;
integer surgeReady = 0;
string activeHoney = "";

key activeRequest = NULL_KEY;
integer requestPending = FALSE;
integer requestSentUnix = 0;
integer requestRetryCount = 0;
integer nextRequestUnix = 0;
integer errorNotified = FALSE;

debugSay(string msg)
{
    if (DEBUG) llOwnerSay(msg);
}

integer safeInt(string body, list path, integer fallback)
{
    string value = llJsonGetValue(body, path);
    if (value == "" || value == JSON_INVALID) return fallback;
    return (integer)value;
}

string safeString(string body, list path, string fallback)
{
    string value = llJsonGetValue(body, path);
    if (value == "" || value == JSON_INVALID) return fallback;
    return value;
}

string twoDigits(integer value)
{
    if (value < 10) return "0" + (string)value;
    return (string)value;
}

string honeyCountdown()
{
    integer now = llGetUnixTime();
    integer remaining = 0;

    if (honeyExpireTime > now)
        remaining = honeyExpireTime - now;

    return twoDigits(remaining / 60) + ":" + twoDigits(remaining % 60);
}

string progressText()
{
    integer safe = ritualProgress;
    if (safe < 0) safe = 0;
    if (safe > 100) safe = 100;
    return (string)safe + "%";
}

string currentAuthMode()
{
    if (USE_SIGNING && SIGNING_SECRET != "") return "signed";
    if (SHARED_TOKEN != "") return "token";
    return "open";
}

string generateRequestId()
{
    integer stamp = llGetUnixTime();
    integer noise = (integer)llFrand(2147483647.0);
    return "req-" + (string)stamp + "-" + (string)noise;
}

string buildCanonicalString(integer timestamp, string requestId)
{
    list fields = [
        "v1",
        "POST",
        "/api/event",
        (string)llGetOwner(),
        "hud_tick",
        "",
        (string)llGetKey(),
        "0:0",
        "",
        "0",
        "0",
        "",
        "",
        "",
        "0",
        "",
        "",
        "",
        "0",
        "0",
        "0",
        (string)timestamp,
        requestId
    ];

    return llDumpList2String(fields, "|");
}

string computeSignature(integer timestamp, string requestId)
{
    return llSHA1String(SIGNING_SECRET + "|" + buildCanonicalString(timestamp, requestId));
}

renderHud()
{
    string display =
        "JLS HUD\n"
        + "lvl " + (string)level + "  rituals " + (string)rituals + "\n"
        + "bonds " + (string)bonds + "  watchers " + (string)watchers + "\n"
        + "pentacles " + (string)pentacles + "\n"
        + "progress " + progressText() + "\n"
        + "honey " + activeHoney + " " + honeyCountdown() + "\n"
        + "surge " + (string)surgeReady + "  auth " + currentAuthMode();

    if (usingFallback)
        display += "\nendpoint fallback";

    llSetText(display, <1.0, 1.0, 1.0>, 1.0);
}

processResponseBody(string body)
{
    level = safeInt(body, ["state", "level"], level);
    rituals = safeInt(body, ["state", "rituals"], rituals);
    bonds = safeInt(body, ["state", "bonds"], bonds);
    watchers = safeInt(body, ["state", "watchers"], watchers);
    pentacles = safeInt(body, ["state", "pentacles"], pentacles);
    ritualProgress = safeInt(body, ["state", "ritual_progress"], ritualProgress);
    activeHoney = safeString(body, ["state", "honey"], activeHoney);
    honeyExpireTime = safeInt(body, ["state", "honey_expire"], honeyExpireTime);
    surgeReady = safeInt(body, ["state", "surge_ready"], surgeReady);
}

integer markRequestFailure(string reason)
{
    requestPending = FALSE;
    activeRequest = NULL_KEY;
    requestRetryCount++;

    if (requestRetryCount == 1 && !usingFallback)
    {
        usingFallback = TRUE;
        apiUrl = API_FALLBACK;
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
        debugSay("request failed: " + reason);
        errorNotified = TRUE;
    }

    return FALSE;
}

sendHudRequest()
{
    integer timestamp = llGetUnixTime();
    string requestId = generateRequestId();
    list fields = [
        "avatar", (string)llGetOwner(),
        "object", (string)llGetKey(),
        "action", "hud_tick"
    ];

    if (USE_SIGNING && SIGNING_SECRET != "")
    {
        fields += [
            "timestamp", timestamp,
            "request_id", requestId,
            "signature", computeSignature(timestamp, requestId)
        ];
    }
    else if (SHARED_TOKEN != "")
    {
        fields += ["token", SHARED_TOKEN];
    }

    string body = llList2Json(JSON_OBJECT, fields);

    activeRequest = llHTTPRequest(
        apiUrl,
        [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"],
        body
    );

    requestPending = TRUE;
    requestSentUnix = llGetUnixTime();
}

default
{
    state_entry()
    {
        apiUrl = API_MAIN;
        usingFallback = FALSE;
        renderHud();
        llSetTimerEvent(0.5);
        llOwnerSay("JLS minimal HUD ready.");
    }

    timer()
    {
        integer now = llGetUnixTime();

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

        renderHud();
    }

    http_response(key requestId, integer status, list meta, string body)
    {
        if (requestId != activeRequest) return;

        requestPending = FALSE;
        activeRequest = NULL_KEY;

        if (status != 200)
        {
            markRequestFailure("http_" + (string)status);
            return;
        }

        if (llStringLength(body) == 0 || llJsonValueType(body, []) == JSON_INVALID)
        {
            markRequestFailure("invalid_json");
            return;
        }

        processResponseBody(body);
        requestRetryCount = 0;
        errorNotified = FALSE;
        renderHud();
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
