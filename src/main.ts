import '@fontsource-variable/inter';
import './style.css';
import horseUrl from './assets/horse.glb?url';
import { loadHorseAsset, startGame } from './app/game.ts';

// Horses are built from the sculpted asset, so load it before the first frame.
const game = loadHorseAsset(horseUrl).then(() => startGame());
if (import.meta.hot) {
	import.meta.hot.accept();
	import.meta.hot.dispose(() => {
		void game.then((running) => running.dispose());
	});
}
