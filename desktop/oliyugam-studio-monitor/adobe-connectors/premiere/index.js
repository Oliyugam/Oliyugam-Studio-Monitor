const endpoint = document.querySelector("#endpoint");
const token = document.querySelector("#token");
const status = document.querySelector("#status");
endpoint.value = localStorage.getItem("endpoint") || "";
token.value = localStorage.getItem("token") || "";

async function report(state) {
  if (!endpoint.value || !token.value) return;
  try {
    const response = await fetch(endpoint.value, { method: "POST", headers: { "Content-Type": "application/json", "X-Oliyugam-Connector-Token": token.value }, body: JSON.stringify({ applicationId: "adobe-premiere-pro", state }) });
    status.textContent = response.ok ? `Connected · ${state}` : "Studio Monitor rejected this connector configuration.";
  } catch { status.textContent = "Studio Monitor is unavailable on this device."; }
}

document.querySelector("#save").addEventListener("click", async () => {
  localStorage.setItem("endpoint", endpoint.value.trim()); localStorage.setItem("token", token.value.trim());
  await report("working");
});

try {
  const ppro = require("premierepro");
  const encoder = ppro.EncoderManager.getManager();
  const events = ppro.Constants.EncoderEvent;
  ppro.EventManager.addEventListener(encoder, events.RENDER_QUEUE, () => void report("working"));
  ppro.EventManager.addEventListener(encoder, events.RENDER_PROGRESS, () => void report("rendering"));
  ppro.EventManager.addEventListener(encoder, events.RENDER_COMPLETE, () => void report("idle"));
  ppro.EventManager.addEventListener(encoder, events.RENDER_CANCEL, () => void report("idle"));
  ppro.EventManager.addEventListener(encoder, events.RENDER_ERROR, () => void report("unavailable"));
} catch { status.textContent = "Premiere event API is unavailable in this host version."; }
