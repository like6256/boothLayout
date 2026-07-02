import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode는 의도적으로 사용하지 않음: Konva 노드 이중 마운트로 인한
// ref/Transformer 문제를 피하기 위해서다.
createRoot(document.getElementById('root')!).render(<App />);
