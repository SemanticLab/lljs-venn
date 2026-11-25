// P3 thumbnails and known P18 files are indexed in collection.js.
// Resolve other P18 files in batches and share lookups across directory views.
const photoQueue = new Map();
const photoCache = new Map();
let photoTimer;
function wikidataImage(id) {
  if (!photoCache.has(id)) {
    photoCache.set(id, new Promise((resolve) => photoQueue.set(id, resolve)));
    clearTimeout(photoTimer);
    photoTimer = setTimeout(loadWikidataImages, 20);
  }
  return photoCache.get(id);
}
async function loadWikidataImages() {
  const pending = [...photoQueue];
  photoQueue.clear();
  for (let start = 0; start < pending.length; start += 40) {
    const batch = pending.slice(start, start + 40);
    const params = new URLSearchParams({
      action: "wbgetentities",
      props: "claims",
      format: "json",
      origin: "*",
      ids: batch.map(([id]) => id).join("|"),
    });
    try {
      const response = await fetch(
        "https://www.wikidata.org/w/api.php?" + params
      );
      if (!response.ok) throw Error("Wikidata unavailable");
      const { entities } = await response.json();
      for (const [id, resolve] of batch) {
        const claims = (entities[id]?.claims?.P18 || []).filter(
          (c) => c.rank !== "deprecated" && c.mainsnak?.datavalue
        );
        const image = claims.find((c) => c.rank === "preferred") || claims[0];
        resolve(image?.mainsnak.datavalue.value);
      }
    } catch {
      for (const [id, resolve] of batch) {
        photoCache.delete(id);
        resolve();
      }
    }
  }
}

function portrait(person, credit) {
  const avatar = document.createElement("span");
  avatar.className = credit ? "avatar large" : "avatar";
  avatar.setAttribute("aria-hidden", "true");
  const words = person.name.trim().split(/\s+/);
  avatar.textContent = (
    words[0][0] + (words.length > 1 ? words.at(-1)[0] : "")
  ).toLocaleUpperCase();
  const photo = person.photo;
  const candidates = [photo.local, photo.url].filter(Boolean);
  let commons = photo.commonsFile;
  let lookedUp = Boolean(commons);
  async function next() {
    if (!candidates.length && photo.wikidata && !lookedUp) {
      lookedUp = true;
      commons = await wikidataImage(photo.wikidata);
      if (commons)
        candidates.push(
          "https://commons.wikimedia.org/wiki/Special:FilePath/" +
            encodeURIComponent(commons) +
            "?width=300"
        );
    }
    if (!candidates.length) return;
    const img = new Image();
    img.alt = "";
    img.loading = credit ? "eager" : "lazy";
    img.decoding = "async";
    img.onload = () => {
      img.style.visibility = "visible";
      if (credit) {
        credit.hidden = false;
        credit.href = commons
          ? "https://commons.wikimedia.org/wiki/File:" +
            encodeURIComponent(commons)
          : itemUrl(person.id);
        credit.textContent = commons
          ? "Photo credit and license · " + commons
          : "Photo source · Semantic Lab";
      }
    };
    img.onerror = () => {
      img.remove();
      if (avatar.isConnected) next();
    };
    img.style.visibility = "hidden";
    img.src = candidates.shift();
    avatar.append(img);
  }
  next();
  return avatar;
}
