import '@fontsource-variable/inter';
import './style.css';
import { startGame } from './app/game.ts';

const game = startGame();
if (import.meta.hot) {
	import.meta.hot.accept();
	import.meta.hot.dispose(() => game.dispose());
}
