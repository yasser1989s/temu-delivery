console.log("Pro Delivery app loaded");
// ⚡ Pro Delivery Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(registration => {
        console.log(
          "⚡ Pro Delivery Service Worker active:",
          registration.scope
        );
      })
      .catch(error => {
        console.error(
          "Service Worker registration failed:",
          error
        );
      });
  });
}
