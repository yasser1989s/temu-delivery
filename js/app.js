import {
  all,
  get,
  put,
  clear
} from "./db.js";

const $ = id => document.getElementById(id);

let parcels = [];
let filter = "all";
let search = "";
let lastPosition = null;
let totalDistance = 0;
let currentNoteId = null;
let deferredInstall = null;
let mediaStream = null;
let scanTimer = null;

const now = () => new Date().toISOString();

const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function normalizePhone(phone) {
  let value = String(phone || "").replace(/[^\d+]/g, "");

  if (value.startsWith("00")) {
    value = "+" + value.slice(2);
  }

  if (value.startsWith("0") && value.length >= 10) {
    value = "+49" + value.slice(1);
  }

  return value;
}

function addressOf(parcel) {
  const street = [parcel.street, parcel.house]
    .filter(Boolean)
    .join(" ");

  const city = [parcel.zip, parcel.city]
    .filter(Boolean)
    .join(" ");

  return [street, city]
    .filter(Boolean)
    .join("\n");
}

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char])
  );
}

async function init() {
  parcels = await all("parcels");

  const distance = await get("meta", "distance");
  totalDistance = distance?.value || 0;

  bindEvents();
  render();
  initGPS();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() => {});
  }

  updateConnectionStatus();
}

function bindEvents() {
  $("scanBarcodeBtn").onclick = () =>
    openScanner("barcode");

  $("batchBtn").onclick = () =>
    openScanner("batch");

  $("scanParcelBtn").onclick = () =>
    $("parcelImage").click();

  $("parcelImage").onchange = processOCR;

  $("proofImage").onchange = processProof;

  $("pasteBtn").onclick = pasteAddress;

  $("voiceBtn").onclick = voiceInput;

  $("optimizeBtn").onclick = optimizeRoute;

  $("resetBtn").onclick = resetDay;

  $("reportBtn").onclick = makeReport;

  $("copyReportBtn").onclick = copyReport;

  $("exportBtn").onclick = exportCSV;

  $("searchInput").oninput = event => {
    search = event.target.value.toLowerCase();
    render();
  };

  document.querySelectorAll(".chip").forEach(button => {
    button.onclick = () => {
      filter = button.dataset.filter;

      document
        .querySelectorAll(".chip")
        .forEach(x => x.classList.remove("active"));

      button.classList.add("active");

      render();
    };
  });

  $("parcelForm").onsubmit = saveParcelForm;

  $("saveNoteBtn").onclick = saveNote;

  document.querySelectorAll("[data-close]").forEach(button => {
    button.onclick = () =>
      closeModal(button.dataset.close);
  });

  window.addEventListener(
    "beforeinstallprompt",
    event => {
      event.preventDefault();

      deferredInstall = event;

      $("installBtn").classList.remove("hidden");
    }
  );

  $("installBtn").onclick = async () => {
    if (!deferredInstall) return;

    deferredInstall.prompt();

    deferredInstall = null;
  };

  window.addEventListener(
    "online",
    updateConnectionStatus
  );

  window.addEventListener(
    "offline",
    updateConnectionStatus
  );
}

function updateConnectionStatus() {
  $("syncState").textContent =
    navigator.onLine
      ? "🟢 متصل — البيانات محفوظة محليًا"
      : "🟠 بدون إنترنت — الوضع المحلي يعمل";
}

function render() {
  const visible = parcels.filter(parcel => {
    const text = [
      parcel.barcode,
      parcel.name,
      parcel.street,
      parcel.house,
      parcel.zip,
      parcel.city,
      parcel.phone,
      parcel.notes
    ]
      .join(" ")
      .toLowerCase();

    const filterMatch =
      filter === "all" ||
      parcel.status === filter;

    const searchMatch =
      !search ||
      text.includes(search);

    return filterMatch && searchMatch;
  });

  $("parcelsList").innerHTML =
    visible.map(parcelCard).join("");

  $("emptyMsg").classList.toggle(
    "hidden",
    visible.length > 0
  );

  const total = parcels.length;

  const delivered = parcels.filter(
    p => p.status === "delivered"
  ).length;

  const remaining = parcels.filter(
    p =>
      p.status === "pending" ||
      p.status === "reattempt"
  ).length;

  const absent = parcels.filter(
    p => p.status === "absent"
  ).length;

  $("totalCount").textContent = total;

  $("deliveredCount").textContent =
    delivered;

  $("remainingCount").textContent =
    remaining;

  $("absentCount").textContent =
    absent;

  $("distanceKm").textContent =
    Number(totalDistance).toFixed(2);

  $("successRate").textContent =
    (total
      ? Math.round((delivered / total) * 100)
      : 0) + "%";
}

function parcelCard(parcel) {
  const badgeMap = {
    pending: ["متبقي", ""],
    delivered: ["تم", "delivered"],
    absent: ["غياب", "absent"],
    reattempt: ["إعادة", "reattempt"],
    problem: ["مشكلة", "problem"]
  };

  const badge =
    badgeMap[parcel.status] ||
    ["متبقي", ""];

  const address =
    addressOf(parcel) ||
    parcel.rawAddress ||
    "عنوان غير مكتمل";

  const maps =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(address);

  const phone =
    normalizePhone(parcel.phone);

  const whatsapp = phone
    ? `https://wa.me/${phone.replace(
        "+",
        ""
      )}?text=${encodeURIComponent(
        "Hallo, ich bin gerade in Ihrer Straße und habe Ihr Paket dabei."
      )}`
    : "#";

  return `
    <article class="parcel ${
      parcel.status === "delivered"
        ? "done"
        : ""
    }">

      <div class="parcel-head">

        <div class="parcel-title">
          📦 ${escapeHTML(
            parcel.name || "Unbekannt"
          )}

          ${
            parcel.barcode
              ? ` · ${escapeHTML(
                  parcel.barcode
                )}`
              : ""
          }
        </div>

        <span class="badge ${badge[1]}">
          ${badge[0]}
        </span>

      </div>

      <div class="address">
        📍 ${escapeHTML(address).replace(
          /\n/g,
          "<br>"
        )}

        ${
          parcel.notes
            ? `<br>📝 ${escapeHTML(
                parcel.notes
              )}`
            : ""
        }
      </div>

      <div class="meta">
        #${escapeHTML(
          parcel.displayNumber
        )}
        ·
        ${
          parcel.phone
            ? "📞 " +
              escapeHTML(parcel.phone)
            : "بدون هاتف"
        }
      </div>

      <div class="btns">

        <a
          href="${maps}"
          target="_blank"
        >
          🗺️ خريطة
        </a>

        ${
          phone
            ? `
              <a
                class="green"
                href="tel:${phone}"
              >
                📞 اتصال
              </a>
            `
            : ""
        }

        ${
          phone
            ? `
              <a
                class="green"
                href="${whatsapp}"
                target="_blank"
              >
                🟢 واتساب
              </a>
            `
            : ""
        }

        ${
          parcel.status !== "delivered"
            ? `
              <button
                class="orange"
                onclick="deliver('${parcel.id}')"
              >
                ✅ تسليم
              </button>
            `
            : ""
        }

        ${
          parcel.status !== "absent"
            ? `
              <button
                class="red"
                onclick="absent('${parcel.id}')"
              >
                🏠 غياب
              </button>
            `
            : ""
        }

        <button
          class="purple"
          onclick="proof('${parcel.id}')"
        >
          📸 إثبات
        </button>

        <button
          class="gray"
          onclick="note('${parcel.id}')"
        >
          📝 ملاحظة
        </button>

        ${
          parcel.status === "absent"
            ? `
              <button
                class="orange"
                onclick="reattempt('${parcel.id}')"
              >
                🔄 إعادة
              </button>
            `
            : ""
        }

      </div>

    </article>
  `;
}

function newParcel(data = {}) {
  return {
    id: uid(),
    displayNumber: parcels.length + 1,
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
    ...data
  };
}

async function saveParcel(parcel) {
  const duplicate =
    parcel.barcode &&
    parcels.find(
      p =>
        p.barcode === parcel.barcode &&
        p.id !== parcel.id
    );

  if (duplicate) {
    alert("⚠️ هذا الباركود موجود مسبقًا.");
    return false;
  }

  parcel.phone =
    normalizePhone(parcel.phone);

  parcel.updatedAt = now();

  await put("parcels", parcel);

  const index =
    parcels.findIndex(
      p => p.id === parcel.id
    );

  if (index >= 0) {
    parcels[index] = parcel;
  } else {
    parcels.push(parcel);
  }

  render();

  return true;
}

function openParcelModal(parcel = null) {
  $("editId").value =
    parcel?.id || "";

  $("fBarcode").value =
    parcel?.barcode || "";

  $("fName").value =
    parcel?.name || "";

  $("fStreet").value =
    parcel?.street || "";

  $("fHouse").value =
    parcel?.house || "";

  $("fZip").value =
    parcel?.zip || "";

  $("fCity").value =
    parcel?.city || "";

  $("fPhone").value =
    parcel?.phone || "";

  $("fNotes").value =
    parcel?.notes || "";

  openModal("parcelModal");
}

async function saveParcelForm(event) {
  event.preventDefault();

  const id = $("editId").value;

  const parcel =
    id
      ? parcels.find(p => p.id === id) ||
        newParcel()
      : newParcel();

  Object.assign(parcel, {
    barcode:
      $("fBarcode").value.trim(),

    name:
      $("fName").value.trim(),

    street:
      $("fStreet").value.trim(),

    house:
      $("fHouse").value.trim(),

    zip:
      $("fZip").value.trim(),

    city:
      $("fCity").value.trim(),

    phone:
      $("fPhone").value.trim(),

    notes:
      $("fNotes").value.trim()
  });

  if (await saveParcel(parcel)) {
    closeModal("parcelModal");
  }
}

async function processOCR(event) {
  const file = event.target.files[0];

  event.target.value = "";

  if (!file) return;

  loading(true);

  try {
    const result =
      await Tesseract.recognize(
        file,
        "deu+eng"
      );

    const text =
      result.data.text.trim();

    const parsed =
      parseAddress(text);

    openParcelModal({
      ...newParcel(),
      ...parsed,
      rawAddress: text
    });

  } catch (error) {
    alert(
      "تعذر قراءة البوليصة: " +
      error.message
    );
  } finally {
    loading(false);
  }
}

function parseAddress(text) {
  const lines =
    text
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(x => x.length > 2);

  const phone =
    (
      text.match(
        /(?:\+49|0049|0)\s?[\d\s()/.-]{8,}/
      ) || [""]
    )[0];

  const zip =
    (
      text.match(/\b\d{5}\b/) ||
      [""]
    )[0];

  let city = "";

  if (zip) {
    const index =
      text.indexOf(zip);

    if (index >= 0) {
      city =
        (
          text
            .slice(index + 5)
            .split(/\r?\n/)[0] ||
          ""
        )
          .replace(
            /[^\p{L}\s-]/gu,
            ""
          )
          .trim();
    }
  }

  let street = "";
  let house = "";

  for (const line of lines) {
    const match =
      line.match(
        /^(.+?)\s+(\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?)\s*$/
      );

    if (match) {
      street =
        match[1].trim();

      house =
        match[2].trim();

      break;
    }
  }

  return {
    name: lines[0] || "",
    street,
    house,
    zip,
    city,
    phone: phone.trim(),
    rawAddress: text
  };
}

async function pasteAddress() {
  try {
    const text =
      await navigator.clipboard.readText();

    if (!text) {
      alert("الحافظة فارغة.");
      return;
    }

    openParcelModal({
      ...newParcel(),
      ...parseAddress(text),
      rawAddress: text
    });

  } catch {
    alert(
      "المتصفح منع قراءة الحافظة."
    );
  }
}

function voiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert(
      "الإدخال الصوتي غير مدعوم في هذا المتصفح."
    );
    return;
  }

  const recognition =
    new SpeechRecognition();

  recognition.lang = "ar-SA";

  recognition.onresult = event => {
    const text =
      event.results[0][0].transcript;

    openParcelModal({
      ...newParcel(),
      ...parseAddress(text),
      rawAddress: text
    });
  };

  recognition.start();
}

async function deliver(id) {
  const parcel =
    parcels.find(p => p.id === id);

  if (!parcel) return;

  parcel.status = "delivered";
  parcel.deliveredAt = now();

  parcel.deliveredLat =
    lastPosition?.lat || null;

  parcel.deliveredLon =
    lastPosition?.lon || null;

  await saveParcel(parcel);

  announce("تم التسليم");
}

async function absent(id) {
  const parcel =
    parcels.find(p => p.id === id);

  if (!parcel) return;

  parcel.status = "absent";
  parcel.absentAt = now();

  parcel.attempts =
    (parcel.attempts || 0) + 1;

  await saveParcel(parcel);

  if (parcel.phone) {
    location.href =
      `sms:${normalizePhone(
        parcel.phone
      )}?body=${encodeURIComponent(
        "Hallo, ich habe versucht, Ihr Paket zuzustellen, aber Sie waren nicht zu Hause."
      )}`;
  }
}

async function reattempt(id) {
  const parcel =
    parcels.find(p => p.id === id);

  if (!parcel) return;

  parcel.status = "reattempt";

  await saveParcel(parcel);
}

window.deliver = deliver;
window.absent = absent;
window.reattempt = reattempt;

window.proof = id => {
  $("proofImage").dataset.id = id;
  $("proofImage").click();
};

window.note = async id => {
  currentNoteId = id;

  const parcel =
    parcels.find(p => p.id === id);

  $("noteText").value =
    parcel?.notes || "";

  openModal("noteModal");
};

async function processProof(event) {
  const file =
    event.target.files[0];

  const id =
    event.target.dataset.id;

  event.target.value = "";

  if (!file) return;

  const parcel =
    parcels.find(p => p.id === id);

  if (!parcel) return;

  loading(true);

  try {
    parcel.proof =
      await compressImage(file);

    parcel.status =
      "delivered";

    parcel.deliveredAt =
      now();

    parcel.deliveredLat =
      lastPosition?.lat || null;

    parcel.deliveredLon =
      lastPosition?.lon || null;

    await saveParcel(parcel);

    announce(
      "تم حفظ إثبات التسليم"
    );

  } finally {
    loading(false);
  }
}

function compressImage(
  file,
  max = 1280,
  quality = 0.72
) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        const image =
          new Image();

        image.onload = () => {
          const scale =
            Math.min(
              1,
              max / image.width,
              max / image.height
            );

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            Math.round(
              image.width * scale
            );

          canvas.height =
            Math.round(
              image.height * scale
            );

          canvas
            .getContext("2d")
            .drawImage(
              image,
              0,
              0,
              canvas.width,
              canvas.height
            );

          resolve(
            canvas.toDataURL(
              "image/jpeg",
              quality
            )
          );
        };

        image.onerror = reject;

        image.src = reader.result;
      };

      reader.onerror = reject;

      reader.readAsDataURL(file);
    }
  );
}

async function saveNote() {
  const parcel =
    parcels.find(
      p => p.id === currentNoteId
    );

  if (!parcel) return;

  parcel.notes =
    $("noteText").value.trim();

  await saveParcel(parcel);

  closeModal("noteModal");
}

function initGPS() {
  if (!navigator.geolocation)
    return;

  navigator.geolocation.watchPosition(
    position => {
      const {
        latitude: lat,
        longitude: lon,
        accuracy
      } = position.coords;

      if (accuracy > 80)
        return;

      if (lastPosition) {
        const distance =
          haversine(
            lastPosition.lat,
            lastPosition.lon,
            lat,
            lon
          );

        if (
          distance > 0.005 &&
          distance < 1.5
        ) {
          totalDistance += distance;

          put("meta", {
            key: "distance",
            value: totalDistance
          });
        }
      }

      lastPosition = {
        lat,
        lon,
        accuracy
      };

      render();
    },
    () => {},
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    }
  );
}

function haversine(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const R = 6371;

  const dLat =
    (lat2 - lat1) *
    Math.PI /
    180;

  const dLon =
    (lon2 - lon1) *
    Math.PI /
    180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      lat1 * Math.PI / 180
    ) *
    Math.cos(
      lat2 * Math.PI / 180
    ) *
    Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function optimizeRoute() {
  if (!parcels.length) {
    alert(
      "أضف طرودًا أولاً."
    );
    return;
  }

  if (!lastPosition) {
    alert(
      "اسمح للتطبيق بالوصول إلى موقعك أولاً."
    );
    return;
  }

  const pending =
    parcels.filter(
      p =>
        ["pending", "reattempt"]
          .includes(p.status) &&
        p.lat &&
        p.lon
    );

  if (!pending.length) {
    $("nextStop").textContent =
      "لا توجد طرود تحتوي على إحداثيات جاهزة للتحسين.";
    return;
  }

  let current = {
    lat: lastPosition.lat,
    lon: lastPosition.lon
  };

  const remaining = [
    ...pending
  ];

  const ordered = [];

  while (remaining.length) {
    let best = remaining[0];
    let bestDistance = Infinity;

    for (const parcel of remaining) {
      const distance =
        haversine(
          current.lat,
          current.lon,
          parcel.lat,
          parcel.lon
        );

      if (distance < bestDistance) {
        best = parcel;
        bestDistance = distance;
      }
    }

    ordered.push(best);

    const index =
      remaining.findIndex(
        p => p.id === best.id
      );

    remaining.splice(index, 1);

    current = {
      lat: best.lat,
      lon: best.lon
    };
  }

  const first = ordered[0];

  $("nextStop").innerHTML = `
    <b>📍 التالي:</b>
    ${escapeHTML(
      first.name || "طرد"
    )}

    <br>

    ${escapeHTML(
      addressOf(first) ||
      first.rawAddress ||
      "عنوان غير مكتمل"
    )}

    <br>

    <span class="meta">
      المسافة التقريبية:
      ${haversine(
        lastPosition.lat,
        lastPosition.lon,
        first.lat,
        first.lon
      ).toFixed(2)}
      km
    </span>

    <br><br>

    <a
      class="main-btn"
      href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        addressOf(first)
      )}"
      target="_blank"
    >
      🗺️ افتح الملاحة
    </a>
  `;
}

async function resetDay() {
  if (
    !confirm(
      "حذف جميع الطرود وتصفير المسافة؟"
    )
  ) {
    return;
  }

  await clear("parcels");
  await clear("meta");

  parcels = [];
  totalDistance = 0;

  render();

  $("reportPreview").textContent =
    "لا يوجد تقرير بعد.";
}

function makeReport() {
  const total =
    parcels.length;

  const delivered =
    parcels.filter(
      p => p.status === "delivered"
    ).length;

  const absent =
    parcels.filter(
      p => p.status === "absent"
    ).length;

  const remaining =
    parcels.filter(
      p =>
        p.status === "pending" ||
        p.status === "reattempt"
    ).length;

  const success =
    total
      ? (
          delivered /
          total *
          100
        ).toFixed(1)
      : "0";

  const report = `
📦 Pro Delivery
${new Date().toLocaleDateString("de-DE")}

--------------------------------

إجمالي الطرود: ${total}

تم التسليم: ${delivered}

غياب: ${absent}

متبقي: ${remaining}

نسبة النجاح: ${success}%

المسافة:
${totalDistance.toFixed(2)} km

--------------------------------

تم إنشاء التقرير محليًا.
`.trim();

  $("reportPreview").textContent =
    report;

  return report;
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(
      makeReport()
    );

    alert("تم النسخ.");
  } catch {
    alert("تعذر النسخ.");
  }
}

function exportCSV() {
  const rows = [
    [
      "Barcode",
      "Name",
      "Street",
      "House",
      "ZIP",
      "City",
      "Phone",
      "Status",
      "Created",
      "Delivered",
      "Absent"
    ]
  ];

  parcels.forEach(parcel => {
    rows.push([
      parcel.barcode,
      parcel.name,
      parcel.street,
      parcel.house,
      parcel.zip,
      parcel.city,
      parcel.phone,
      parcel.status,
      parcel.createdAt,
      parcel.deliveredAt || "",
      parcel.absentAt || ""
    ]);
  });

  const csv =
    "\uFEFF" +
    rows
      .map(row =>
        row
          .map(
            value =>
              `"${String(
                value ?? ""
              ).replaceAll(
                '"',
                '""'
              )}"`
          )
          .join(",")
      )
      .join("\n");

  const url =
    URL.createObjectURL(
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8"
        }
      )
    );

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `pro-delivery-${
      new Date()
        .toISOString()
        .slice(0, 10)
    }.csv`;

  link.click();

  URL.revokeObjectURL(url);
}

async function openScanner(mode) {
  $("scannerTitle").textContent =
    mode === "batch"
      ? "⚡ المسح السريع"
      : "🔳 مسح الباركود";

  $("scanResult").textContent =
    "";

  openModal("scannerModal");

  try {
    mediaStream =
      await navigator.mediaDevices.getUserMedia(
        {
          video: {
            facingMode: {
              ideal: "environment"
            }
          }
        }
      );

    $("scannerVideo").srcObject =
      mediaStream;

    await $("scannerVideo").play();

    scanLoop(mode);

  } catch {
    closeScanner();

    alert(
      "تعذر فتح الكاميرا. تأكد من إعطاء صلاحية الكاميرا واستخدام HTTPS."
    );
  }
}

async function scanLoop(mode) {
  const video =
    $("scannerVideo");

  if (!("BarcodeDetector" in window)) {
    await fallbackZXing(mode);
    return;
  }

  let detector;

  try {
    detector =
      new BarcodeDetector({
        formats: [
          "qr_code",
          "code_128",
          "ean_13",
          "ean_8",
          "data_matrix",
          "pdf417",
          "aztec",
          "upc_a",
          "upc_e"
        ]
      });
  } catch {
    detector =
      new BarcodeDetector();
  }

  const loop = async () => {
    if (
      $("scannerModal")
        .classList
        .contains("hidden")
    ) {
      return;
    }

    try {
      const codes =
        await detector.detect(video);

      if (codes.length) {
        const value =
          codes[0].rawValue;

        $("scanResult").textContent =
          "✅ " + value;

        await handleBarcode(value);

        if (mode === "batch") {
          await sleep(700);
          return scanLoop(mode);
        }

        closeScanner();
        return;
      }
    } catch {}

    scanTimer =
      requestAnimationFrame(loop);
  };

  loop();
}

async function fallbackZXing(mode) {
  try {
    const module =
      await import(
        "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm"
      );

    const reader =
      new module.BrowserMultiFormatReader();

    const controls =
      await reader.decodeFromVideoDevice(
        undefined,
        $("scannerVideo"),
        async result => {
          if (!result) return;

          const value =
            result.getText();

          $("scanResult").textContent =
            "✅ " + value;

          await handleBarcode(value);

          if (mode !== "batch") {
            controls?.stop();
            closeScanner();
          }
        }
      );

  } catch {
    alert(
      "هذا المتصفح لا يدعم BarcodeDetector ولم يمكن تحميل البديل. جرّب Chrome حديثًا."
    );

    closeScanner();
  }
}

async function handleBarcode(value) {
  const existing =
    parcels.find(
      p => p.barcode === value
    );

  if (existing) {
    $("scanResult").textContent =
      "⚠️ موجود: " + value;

    return existing;
  }

  const parcel =
    newParcel({
      barcode: value
    });

  await saveParcel(parcel);

  openParcelModal(parcel);

  return parcel;
}

function closeScanner() {
  if (scanTimer) {
    cancelAnimationFrame(
      scanTimer
    );

    scanTimer = null;
  }

  if (mediaStream) {
    mediaStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );

    mediaStream = null;
  }

  $("scannerVideo").srcObject =
    null;

  closeModal(
    "scannerModal"
  );
}

function openModal(id) {
  $(id).classList.remove(
    "hidden"
  );
}

function closeModal(id) {
  $(id).classList.add(
    "hidden"
  );

  if (
    id === "scannerModal"
  ) {
    closeScanner();
  }
}

function loading(show) {
  $("loading").classList.toggle(
    "hidden",
    !show
  );
}

function announce(text) {
  try {
    speechSynthesis.speak(
      new SpeechSynthesisUtterance(
        text
      )
    );
  } catch {}
}

init();
