from pathlib import Path
import cv2

root = Path(__file__).resolve().parents[1]
source = root / 'assets' / 'installation' / 'Sig-P320-Reaper-FRT-Install_.mp4'
out_dir = root / 'assets' / 'hero'
out_dir.mkdir(parents=True, exist_ok=True)
cap = cv2.VideoCapture(str(source))
fps = cap.get(cv2.CAP_PROP_FPS) or 30
source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
width = 960
height = round(width * source_height / source_width)
duration = min(6.0, max(1.0, (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 180) / fps))
fourcc = cv2.VideoWriter_fourcc(*'VP80')
writer = cv2.VideoWriter(str(out_dir / 'p320-reaper-demo.webm'), fourcc, min(fps, 30), (width, height))
first = None
frame_limit = int(duration * fps)
for _ in range(frame_limit):
    ok, frame = cap.read()
    if not ok:
        break
    if first is None:
        first = frame.copy()
    writer.write(cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA))
cap.release()
writer.release()
if first is not None:
    cv2.imwrite(str(out_dir / 'p320-reaper-demo-poster.jpg'), first, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
print({'duration_target_seconds': round(duration, 2), 'size': [width, height]})
