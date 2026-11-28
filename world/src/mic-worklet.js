// Отдаёт звук микрофона блоками в основной поток.
class Mic extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('mic', Mic);
