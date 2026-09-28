const endpoint = document.querySelector("#endpoint");
const token = document.querySelector("#token");
const status = document.querySelector("#status");
endpoint.value = localStorage.getItem("endpoint") || "";
token.value = localStorage.getItem("token") || "";
async function report(state) {
  if (!endpoint.value || !token.value) return;
  try {
    const response = await fetch(endpoint.value, { method: "POST", headers: { "Content-Type": "application/json", "X-Oliyugam-Connector-Token": token.value }, body: JSON.stringify({ applicationId: "adobe-photoshop", state }) });
    status.textContent = response.ok ? `Connected · ${state}` : "Studio Monitor rejected this connector configuration.";
  } catch { status.textContent = "Studio Monitor is unavailable on this device."; }
}
document.querySelector("#save").addEventListener("click", async () => { localStorage.setItem("endpoint", endpoint.value.trim()); localStorage.setItem("token", token.value.trim()); await report("working"); });
try {
  const photoshop = require("photoshop");
  photoshop.action.addNotificationListener(["open", "select", "save"], () => void report("working"));
  photoshop.action.addNotificationListener(["export"], () => void report("exporting"));
} catch { status.textContent = "Photoshop action notifications are unavailable in this host version."; }
