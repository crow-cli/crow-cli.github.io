// Crow — bird's-eye surface-wave shader.
// Original work: a rugged anisotropic-fbm heightfield (wave rows) summed with
// low-frequency crossing swells, shaded softly by a finite-difference normal.
// The field drifts northward (landscape scrolls down => we fly north) instead of
// the original eastward drift. No glitter, no cursor interaction. Not derived
// from any third-party shader source. Static-first: renders a single frame when
// the user prefers reduced motion or when WebGL is unavailable.
(function () {
  "use strict";

  var canvas = document.getElementById("bg");
  if (!canvas) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gl =
    canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl");

  if (!gl) {
    document.body.classList.add("no-gl");
    return;
  }

  var VERT = [
    "attribute vec2 a_pos;",
    "void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }",
  ].join("\n");

  // Bird's-eye surface: the original rugged anisotropic-fbm heightfield (wave
  // rows + low-frequency crossing swells) you liked — spatially unchanged. Only
  // the drift is redirected: the landscape now scrolls DOWN (we appear to fly
  // NORTH) instead of the old leftward/eastward scroll. No glitter, no cursor
  // interaction.
  var FRAG = [
    "precision highp float;",
    "uniform vec2  u_res;",
    "uniform float u_time;",
    "uniform float u_aspect;",

    "float hash21(vec2 p){",
    "  p = fract(p * vec2(123.34, 345.56));",
    "  p += dot(p, p + 34.32);",
    "  return fract(p.x * p.y);",
    "}",

    "float noise(vec2 p){",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  float a = hash21(i);",
    "  float b = hash21(i + vec2(1.0, 0.0));",
    "  float c = hash21(i + vec2(0.0, 1.0));",
    "  float d = hash21(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",

    "float fbm(vec2 p){",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 5; i++){",
    "    v += a * noise(p);",
    "    p = mat2(1.6, 1.2, -1.2, 1.6) * p;", // rotate+scale to decorrelate octaves
    "    a *= 0.5;",
    "  }",
    "  return v;", // ~0..1
    "}",

    "float height(vec2 p){",
    // anisotropic fbm stretched along x => rugged wave rows. Drift redirected:
    // landscape scrolls DOWN (we appear to fly NORTH) instead of the old east drift.
    "  vec2 q = p * vec2(1.0, 2.2) + vec2(0.0, u_time * 0.11);",
    "  float h = fbm(q) * 2.0 - 1.0;", // -1..1
    // low-frequency crossing swells for large rolling form (unchanged from original)
    "  h += 0.35 * sin(dot(p, vec2(0.80, 0.50)) * 0.8 + u_time * 0.22);",
    "  h += 0.22 * sin(dot(p, vec2(-0.40, 0.90)) * 1.1 + u_time * 0.30 + 2.0);",
    "  return h;",
    "}",

    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / u_res;",
    "  vec2 p = (uv - 0.5) * vec2(u_aspect, 1.0) * 3.2;",

    "  float e = 0.05;",
    "  float h  = height(p);",
    "  float hx = height(p + vec2(e, 0.0));",
    "  float hz = height(p + vec2(0.0, e));",
    "  vec3 n = normalize(vec3((h - hx) / e, 2.2, (h - hz) / e));", // y up

    "  vec3 L = normalize(vec3(0.5, 0.7, 0.5));",
    "  float diff = max(dot(n, L), 0.0);",
    "  float amb = 0.30;",

    "  vec3 deep  = vec3(0.020, 0.016, 0.034);",
    "  vec3 crest = vec3(0.12, 0.08, 0.22);",
    "  vec3 col = mix(deep, crest, clamp(h * 0.35 + 0.5, 0.0, 1.0));",
    "  col *= amb + (1.0 - amb) * diff;", // soft shading follows the surface
    "  col += crest * 0.12 * smoothstep(0.25, 0.9, h);", // lighten true crests

    "  float vig = length(uv - 0.5);",
    "  col *= 1.0 - 0.30 * vig * vig;",
    "  col += (hash21(uv * u_res + u_time) - 0.5) * 0.014;",

    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    document.body.classList.add("no-gl");
    return;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  var loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var u_res = gl.getUniformLocation(prog, "u_res");
  var u_time = gl.getUniformLocation(prog, "u_time");
  var u_aspect = gl.getUniformLocation(prog, "u_aspect");

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(window.innerWidth * dpr);
    var h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener("resize", resize);

  var start = performance.now();
  var T0 = reduce ? 9.0 : 0.0; // a pleasant static phase if motion is reduced

  function frame(now) {
    resize();
    var t = T0 + (now - start) / 1000;
    var aspect = canvas.width / canvas.height;
    gl.uniform2f(u_res, canvas.width, canvas.height);
    gl.uniform1f(u_time, t);
    gl.uniform1f(u_aspect, aspect);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduce) requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  // copy buttons
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      navigator.clipboard.writeText(text).then(function () {
        var old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = old; }, 1400);
      });
    });
  });

  // nav menu toggle
  var trigger = document.querySelector(".menu-trigger");
  var menu = document.getElementById("site-menu-links");
  if (trigger && menu) {
    trigger.addEventListener("click", function () {
      var open = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", String(!open));
      menu.hidden = open;
    });
    menu.addEventListener("click", function (e) {
      if (e.target.classList.contains("nav-link")) {
        trigger.setAttribute("aria-expanded", "false");
        menu.hidden = true;
      }
    });
    document.addEventListener("click", function (e) {
      if (!trigger.contains(e.target) && !menu.contains(e.target)) {
        trigger.setAttribute("aria-expanded", "false");
        menu.hidden = true;
      }
    });
  }
})();
