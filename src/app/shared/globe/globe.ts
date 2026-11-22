import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, inject, input, viewChild,
} from '@angular/core';
import { ServerService } from '../../core/services/server.service';
import { TestingServer } from '../../core/models/models';

interface GeoMultiLine { coordinates: number[][][]; }

/** Lazily loaded Three.js globe: real country geometry and configured measurement nodes only. */
@Component({
  selector: 'nv-globe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host class="globe-host" [class.globe-host--decorative]="decorative()" aria-hidden="true">
      @if (!supported) { <div class="globe-fallback"></div> }
    </div>`,
  styles: `
    @media (max-width: 760px) { .globe-host { display: none; } }
  `,
})
export class GlobeComponent implements AfterViewInit, OnDestroy {
  readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  readonly decorative = input(true);
  protected supported = true;

  private servers = inject(ServerService);
  private three: typeof import('three') | null = null;
  private globeGroup: import('three').Group | null = null;
  private nodeLayer: import('three').Group | null = null;
  private renderer: import('three').WebGLRenderer | null = null;
  private camera: import('three').PerspectiveCamera | null = null;
  private scene: import('three').Scene | null = null;
  private cleanup: (() => void) | null = null;
  private raf = 0;
  private inView = false;
  private disposed = false;
  private observer: IntersectionObserver | null = null;

  constructor() {
    effect(() => {
      const list = this.servers.servers();
      if (this.nodeLayer) this.rebuildNodes(list);
    });
  }

  ngAfterViewInit(): void {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) { this.supported = false; return; }
    this.observer = new IntersectionObserver(entries => {
      this.inView = !!entries[0]?.isIntersecting;
      if (this.inView) this.startLoop(); else this.stopLoop();
    }, { threshold: .01 });
    this.observer.observe(this.host().nativeElement);
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const run = () => { if (!this.disposed) void this.init(); };
    if (idle) idle(run); else window.setTimeout(run, 700);
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.stopLoop();
    this.observer?.disconnect();
    this.cleanup?.();
  }

  private async init(): Promise<void> {
    try {
      const [THREE, worldModule, topojson] = await Promise.all([
        import('three'),
        import('world-atlas/countries-110m.json'),
        import('topojson-client'),
      ]);
      if (this.disposed) return;
      this.three = THREE;

      const el = this.host().nativeElement;
      const width = el.clientWidth || 600, height = el.clientHeight || 600;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, .1, 100);
      camera.position.z = 4.2;
      this.camera = camera;
      this.scene = scene;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height);
      el.appendChild(renderer.domElement);
      this.renderer = renderer;

      const globe = new THREE.Group();
      globe.rotation.z = -.35;
      scene.add(globe);
      this.globeGroup = globe;

      const sphereGeo = new THREE.SphereGeometry(1.35, 32, 20);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x0d1b34, transparent: true, opacity: .34 });
      globe.add(new THREE.Mesh(sphereGeo, sphereMat));

      const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(1.36, 18, 12));
      const wireMat = new THREE.LineBasicMaterial({ color: 0x4f6bff, transparent: true, opacity: .08 });
      globe.add(new THREE.LineSegments(wireGeo, wireMat));

      const topology = (worldModule as { default?: unknown }).default ?? worldModule;
      const objects = (topology as { objects?: Record<string, unknown> }).objects ?? {};
      const countryObject = objects['countries'];
      const borderGeo = new THREE.BufferGeometry();
      if (countryObject) {
        const borders = topojson.mesh(topology as never, countryObject as never) as unknown as GeoMultiLine;
        const vertices: number[] = [];
        for (const line of borders.coordinates ?? []) {
          for (let i = 1; i < line.length; i++) {
            const a = this.latLonToVector(line[i - 1][1], line[i - 1][0], 1.365, THREE);
            const b = this.latLonToVector(line[i][1], line[i][0], 1.365, THREE);
            vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
        }
        borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      }
      const borderMat = new THREE.LineBasicMaterial({ color: 0x4f6bff, transparent: true, opacity: .32 });
      globe.add(new THREE.LineSegments(borderGeo, borderMat));

      this.nodeLayer = new THREE.Group();
      globe.add(this.nodeLayer);
      this.rebuildNodes(this.servers.servers());

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth || 600, h = el.clientHeight || 600;
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
        if (this.inView) renderer.render(scene, camera);
      });
      ro.observe(el);
      if (this.inView) renderer.render(scene, camera);

      this.cleanup = () => {
        ro.disconnect();
        sphereGeo.dispose(); sphereMat.dispose();
        wireGeo.dispose(); wireMat.dispose();
        borderGeo.dispose(); borderMat.dispose();
        if (this.nodeLayer) this.disposeGroup(this.nodeLayer);
        renderer.dispose(); renderer.domElement.remove();
        this.nodeLayer = null; this.globeGroup = null; this.renderer = null; this.camera = null; this.scene = null; this.three = null;
      };
      if (this.inView) this.startLoop();
    } catch { this.supported = false; }
  }

  private rebuildNodes(list: TestingServer[]): void {
    const THREE = this.three;
    const layer = this.nodeLayer;
    if (!THREE || !layer) return;
    this.disposeGroup(layer);

    const nodes = list.filter(s => s.status !== 'offline'
      && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
      && !(s.countryCode === 'LOCAL' && s.latitude === 0 && s.longitude === 0));
    if (!nodes.length) return;

    const positions: import('three').Vector3[] = [];
    for (const s of nodes) positions.push(this.latLonToVector(s.latitude, s.longitude, 1.39, THREE));
    const dotGeo = new THREE.BufferGeometry().setFromPoints(positions);
    const dotMat = new THREE.PointsMaterial({ color: 0x2af5c8, size: .085, transparent: true, opacity: .95 });
    layer.add(new THREE.Points(dotGeo, dotMat));

    if (nodes.length > 1) {
      const arcVertices: number[] = [];
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          if ((i + j) % 2 !== 0) continue;
          const mid = positions[i].clone().add(positions[j]).multiplyScalar(.5).normalize().multiplyScalar(1.72);
          const curve = new THREE.QuadraticBezierCurve3(positions[i], mid, positions[j]);
          const points = curve.getPoints(18);
          for (let k = 1; k < points.length; k++) arcVertices.push(points[k - 1].x, points[k - 1].y, points[k - 1].z, points[k].x, points[k].y, points[k].z);
        }
      }
      const arcGeo = new THREE.BufferGeometry();
      arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcVertices, 3));
      const arcMat = new THREE.LineBasicMaterial({ color: 0x2af5c8, transparent: true, opacity: .17 });
      layer.add(new THREE.LineSegments(arcGeo, arcMat));
    }
  }

  private disposeGroup(group: import('three').Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      const object = child as import('three').Mesh & { geometry?: import('three').BufferGeometry; material?: import('three').Material | import('three').Material[] };
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
      else object.material?.dispose();
    }
  }

  private latLonToVector(lat: number, lon: number, radius: number, THREE: typeof import('three')): import('three').Vector3 {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }

  private startLoop(): void {
    if (this.raf || !this.globeGroup || !this.renderer || !this.camera || !this.scene || !this.inView) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const tick = () => {
      this.raf = 0;
      if (!this.inView || document.visibilityState !== 'visible' || !this.globeGroup || !this.renderer || !this.camera || !this.scene) return;
      this.globeGroup.rotation.y += .0008;
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
