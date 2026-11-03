import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  viewChild,
} from '@angular/core';

const MAX_PIXEL_RATIO = 1.5;
// How quickly the flames catch up with the heat, per second. They die faster than they grow.
const GROW_RATE = 5;
const DIE_RATE = 9;
const REDUCED_MOTION_SPEED = 0.12;

const VERTEX_SHADER = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

// Noise that keeps sliding upward, warped by more noise, cut off at a wavering height.
const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_size;
uniform float u_time;
uniform float u_heat;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  const mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  float value = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 5; i++) {
    value += weight * noise(p);
    p = turn * p * 2.03;
    weight *= 0.5;
  }
  return value / 0.97;
}

float sparks(vec2 p, float scale, float speed, float seed, float t) {
  vec2 g = vec2(p.x * scale, p.y * scale - t * speed);
  g.x += sin(g.y * 0.9 + seed + t * 0.7) * 0.35;
  vec2 id = floor(g);
  if (hash(id + seed) < 0.94) return 0.0;
  vec2 offset = vec2(hash(id + seed + 3.1), hash(id + seed + 7.7)) - 0.5;
  return smoothstep(0.17, 0.03, length(fract(g) - 0.5 - offset * 0.6));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec2 p = vec2(uv.x * u_size.x / u_size.y, uv.y);
  float t = u_time;

  vec2 q = vec2(p.x * 3.4, p.y * 2.1 - t * 1.25);
  vec2 warp = vec2(fbm(q + vec2(0.0, t * 0.25)), fbm(q + vec2(5.2, 1.3 - t * 0.2)));
  float flicker = fbm(q + warp * 1.5);

  float crest = fbm(vec2(p.x * 2.6 + t * 0.12, t * 0.4));
  float height = max(u_heat * (0.42 + 0.85 * crest), 0.001);
  float y = uv.y / height;

  // Calm at the base, more and more broken up toward the tips.
  float f = 1.0 - y + (flicker - 0.5) * (0.5 + 1.25 * clamp(y, 0.0, 1.0));
  f *= smoothstep(0.0, 0.05, u_heat);
  // Burn out before the top of the canvas, so the flames never end in a straight line.
  f -= smoothstep(0.66, 0.98, uv.y + (flicker - 0.5) * 0.45) * 1.8;

  vec3 color = mix(vec3(0.82, 0.16, 0.03), vec3(0.96, 0.38, 0.04), smoothstep(0.0, 0.22, f));
  color = mix(color, vec3(1.0, 0.65, 0.1), smoothstep(0.18, 0.48, f));
  color = mix(color, vec3(1.0, 0.86, 0.36), smoothstep(0.45, 0.8, f));
  color = mix(color, vec3(1.0, 0.97, 0.8), smoothstep(0.8, 1.2, f));
  float alpha = smoothstep(0.0, 0.09, f);

  // The page browns just ahead of the flames.
  float scorch = smoothstep(-0.16, 0.03, f) * (1.0 - alpha) * 0.24 * smoothstep(0.0, 0.3, u_heat);
  // The canvas runs past the top of the page, and there's no paper up there to brown.
  scorch *= 1.0 - smoothstep(0.84, 0.862, uv.y);

  float spark = sparks(p, 17.0, 1.5, 1.0, t) + sparks(p, 27.0, 2.2, 2.0, t);
  spark *= (1.0 - clamp(uv.y / (height * 1.9), 0.0, 1.0)) * smoothstep(0.03, 0.2, u_heat);
  spark = clamp(spark, 0.0, 1.0) * (1.0 - alpha);

  // Premultiplied, so the page shows through wherever nothing is burning.
  vec3 rgb = color * alpha + vec3(0.42, 0.17, 0.03) * scorch + vec3(1.0, 0.55, 0.12) * spark;
  gl_FragColor = vec4(rgb, clamp(alpha + scorch + spark, 0.0, 1.0));
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

// Without WebGL there are no flames, but the words still fade as the heat rises.
@Component({
  selector: 'app-fire',
  template: '<canvas #canvas></canvas>',
  styleUrl: './fire.css',
})
export class Fire implements OnDestroy {
  // 0 is out, 1 reaches the top of the page, and anything above that overflows it.
  readonly heat = input.required<number>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly speed = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? REDUCED_MOTION_SPEED
    : 1;

  private gl: WebGLRenderingContext | null = null;
  private sizeUniform: WebGLUniformLocation | null = null;
  private timeUniform: WebGLUniformLocation | null = null;
  private heatUniform: WebGLUniformLocation | null = null;
  private frame = 0;
  private lastTime = 0;
  private clock = Math.random() * 100;
  private shown = 0;

  constructor() {
    afterNextRender(() => {
      this.setUp();
      this.wake();
    });
    effect(() => {
      if (this.heat() > 0) this.wake();
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  private setUp(): void {
    const gl = this.canvasRef().nativeElement.getContext('webgl', { antialias: false });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.sizeUniform = gl.getUniformLocation(program, 'u_size');
    this.timeUniform = gl.getUniformLocation(program, 'u_time');
    this.heatUniform = gl.getUniformLocation(program, 'u_heat');
    gl.clearColor(0, 0, 0, 0);
    this.gl = gl;
  }

  private wake(): void {
    if (!this.gl || this.frame || this.heat() <= 0) return;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame((time) => this.loop(time));
  }

  private loop(time: number): void {
    const gl = this.gl;
    if (!gl) return;

    const seconds = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.clock = (this.clock + seconds * this.speed) % 1000;

    const target = this.heat();
    const rate = target > this.shown ? GROW_RATE : DIE_RATE;
    this.shown += (target - this.shown) * Math.min(1, seconds * rate);

    if (target <= 0 && this.shown < 0.005) {
      this.shown = 0;
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.frame = 0;
      return;
    }

    this.fitCanvas(gl);
    gl.uniform1f(this.timeUniform, this.clock);
    gl.uniform1f(this.heatUniform, this.shown);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frame = requestAnimationFrame((next) => this.loop(next));
  }

  private fitCanvas(gl: WebGLRenderingContext): void {
    const canvas = this.canvasRef().nativeElement;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(this.sizeUniform, width, height);
  }
}
