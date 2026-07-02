import { Rect, Shape, Text } from 'react-konva';
import { useApp } from '../store/store';
import { fmtLenWithUnit } from '../utils/units';

/**
 * 그리드 + 부스 외곽선. listening=false인 Layer 안에서 사용.
 * 그리드는 화면에 보이는 범위만, 확대 수준에 맞춰 간격을 조절해 그린다.
 */
export function GridAndBooth() {
  const camera = useApp((s) => s.camera);
  const size = useApp((s) => s.containerSize);
  const booth = useApp((s) => s.booth);
  const gridOn = useApp((s) => s.gridOn);
  const gridSize = useApp((s) => s.gridSize);
  const dark = useApp((s) => s.dark);
  const unit = useApp((s) => s.unit);

  const minor = dark ? 'rgba(255,255,255,0.07)' : 'rgba(30,40,80,0.07)';
  const major = dark ? 'rgba(255,255,255,0.16)' : 'rgba(30,40,80,0.16)';
  const boothFill = dark ? '#20242c' : '#ffffff';
  const boothStroke = dark ? '#e8eaf0' : '#1a1d24';
  const labelFill = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={booth.w}
        height={booth.h}
        fill={boothFill}
        listening={false}
        perfectDrawEnabled={false}
      />
      {gridOn && (
        <Shape
          listening={false}
          perfectDrawEnabled={false}
          sceneFunc={(ctx) => {
            const scale = camera.scale;
            const x0 = -camera.x / scale;
            const y0 = -camera.y / scale;
            const x1 = x0 + size.w / scale;
            const y1 = y0 + size.h / scale;
            let step = gridSize;
            while (step * scale < 8) step *= 5;
            const majorStep = step * 5;
            const lw = 1 / scale;

            const drawLines = (s: number, color: string, skipMajor: boolean) => {
              ctx.beginPath();
              for (let x = Math.floor(x0 / s) * s; x <= x1; x += s) {
                if (skipMajor && Math.abs(x % majorStep) < 0.001) continue;
                ctx.moveTo(x, y0);
                ctx.lineTo(x, y1);
              }
              for (let y = Math.floor(y0 / s) * s; y <= y1; y += s) {
                if (skipMajor && Math.abs(y % majorStep) < 0.001) continue;
                ctx.moveTo(x0, y);
                ctx.lineTo(x1, y);
              }
              ctx.setAttr('strokeStyle', color);
              ctx.setAttr('lineWidth', lw);
              ctx.stroke();
            };
            drawLines(step, minor, true);
            drawLines(majorStep, major, false);
          }}
        />
      )}
      <Rect
        x={0}
        y={0}
        width={booth.w}
        height={booth.h}
        stroke={boothStroke}
        strokeWidth={3}
        strokeScaleEnabled={false}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        x={0}
        y={-26 / camera.scale}
        width={booth.w}
        align="center"
        text={fmtLenWithUnit(booth.w, unit)}
        fontSize={14 / camera.scale}
        fill={labelFill}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        x={-26 / camera.scale}
        y={booth.h}
        width={booth.h}
        align="center"
        rotation={-90}
        text={fmtLenWithUnit(booth.h, unit)}
        fontSize={14 / camera.scale}
        fill={labelFill}
        listening={false}
        perfectDrawEnabled={false}
      />
    </>
  );
}
