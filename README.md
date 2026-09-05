# Końska Polana

Przeglądarkowy prototyp spokojnej gry jeździeckiej dla dzieci. Three.js, JavaScript i Vite. Modele powstają w kodzie, dźwięki są syntezowane lokalnie. Gra nie potrzebuje konta ani zewnętrznych usług.

## Uruchomienie

Wymagany Node.js 22.12+ lub 24+.

```sh
npm install
npm run dev
```

Otwórz adres wypisany przez Vite (zwykle http://127.0.0.1:5173). `npm run build` tworzy statyczną wersję w `dist`, którą można umieścić na hostingu. `npm test` sprawdza mechanikę ruchu, skoków i kolizji.

Przy uruchomionym serwerze na porcie 5173: `node scripts/browser-check.mjs` wykonuje test w zainstalowanym Chrome i zapisuje zrzuty w `artifacts/`.
`node scripts/appearance-check.mjs` sprawdza zmiany wszystkich wariantów w podglądzie, zapis wyborów i układ panelu. Testy używają osobnego profilu i nie zmieniają zapisów gracza.

## Sterowanie

- W/S lub góra/dół: zmiana tempa (postój, stęp, kłus, galop), bez trzymania klawisza.
- A/D lub lewo/prawo: skręcanie, również na postoju.
- Spacja: skok z szerokim marginesem czasowym.
- C: kamera TPP/FPP. Przeciągnięcie myszą: rozglądanie.
- Escape: pauza. Zmiana karty lub utrata fokusu również pauzuje grę.
- Przyciski obrazkowe: dźwięk, pomoc, wygląd konia, powrót do stajni, pełny ekran.

Dźwięk rusza po pierwszym kliknięciu lub naciśnięciu klawisza, zgodnie z zasadami przeglądarek. Wygląd konia zapisuje się w localStorage; gdy pamięć jest niedostępna, zmiany działają przez czas sesji.

## Zakres prototypu

Stadnina, łąka, leśna pętla, trzy niskie przeszkody, animowany koń i jeździec, dwie kamery, mapa, kolizje, pauza, syntetyczny tętent i odgłosy przyrody bez muzyki. Można przeskakiwać zarówno przeszkody, jak i ogrodzenie wybiegu.

Panel wyglądu ma cztery sekcje: kolory, fryzury, ozdoby i czaprak. Grzywa i ogon mają niezależny wybór krótkiej, długiej lub zaplecionej fryzury. Dostępne ozdoby to kwiaty, kokarda i wstążki (także na ogonie), pięć kolorów i opcja bez ozdoby. Czaprak może być gładki, w kropki, paski lub gwiazdki. Wszystko jest odblokowane; wybór zapisuje się lokalnie. Zapisy ze starszej wersji zachowują kolory i kwiatek.

To prototyp na PC z klawiaturą, nie gotowa gra mobilna. Dźwięki i modele są robocze. Do oceny z dzieckiem: tempo skręcania, wysokość kamery, czytelność konia, łatwość skoków i płynność na docelowym komputerze.

Model konia jest w `src/horse.js`: zaokrąglona sylwetka, pysk, pasma grzywy i ogona, nogi z ruchomymi stawami oraz dopasowany czaprak i siodło. Podgląd w panelu wyglądu pozwala obracać i przybliżać konia, opcjonalnie z jeźdźcem. Zmiany kolorów są widoczne od razu. Przeciąganie obraca model, kółko myszy przybliża; dostępne są też przyciski i strzałki klawiatury po ustawieniu fokusu na podglądzie.

## Animacje chodów

Stęp ma cztery osobne takty i ciągłe podparcie. Kłus pracuje parami przekątnymi z fazami zawieszenia. Galop to trzytaktowy galop z prawej nogi (canter), z sekwencją: lewa tylna, prawa tylna razem z lewą przednią, prawa przednia, zawieszenie. Model ma osobne ruchy tułowia i jeźdźca, zginanie stawów i płynne przejścia. Tętent jest wyzwalany przez kontakty nóg, a nie niezależny zegar. Prędkości i mechanika skoku pozostają bez zmian. Jest to stylizowana animacja proceduralna, bez motion capture i bez automatycznej zmiany nogi prowadzącej.

Podstawa rytmów: [FEI — Gait](https://www.fei.org/node/38138), [University of Arizona — Horse gaits](https://opentextbooks.library.arizona.edu/app/uploads/sites/274/2023/11/Horse-Gaits.pdf).

`node scripts/gait-check.mjs` zapisuje w `artifacts/gait-phases.png` porównanie czterech faz każdego chodu z boku. Wymaga uruchomionego Vite na porcie 5173. `tests/gaits.test.js` sprawdza kolejność podparć, zawieszenie, przejścia, wyciszenie kroków przy skoku i położenie kopyt.

## Stajnia

Budynek na zachód od placu ma dwa otwarte wjazdy i przejezdną centralną alejkę. Pięć zamkniętych boksów zamieszkują Luna, Fuks, Toffi, Burza i Kasztan. Boksy mają ściółkę, wodę, siano i otwarte fragmenty górnych drzwi, przez które widać konie. Konie w boksach pozostają na miejscu; mają delikatne animacje spoczynkowe.

Siodlarnia znajduje się po prawej stronie od głównego wjazdu. Można do niej wjechać; zawiera siodła na stojakach, ogłowia, złożone czapraki i skrzynkę ze szczotkami. To wyposażenie otoczenia; dekorowanie własnego konia nadal otwiera przycisk z paletą.

Wnętrze ma brukowaną alejkę, drewnianą konstrukcję, dach ze spadkiem, lampy i okna. Kamera TPP skraca dystans przy ścianach i dachu, FPP kieruje się nieco niżej we wnętrzu. Rozmieszczenie ścian i kolizji współdzieli `src/stable-layout.js`.

`node scripts/stable-check.mjs` przejeżdża od punktu startowego do stajni, sprawdza TPP/FPP, wjazd do siodlarni i wyjazd tylnymi drzwiami oraz zapisuje zrzuty. `tests/stable.test.js` sprawdza przejezdność alei, drzwi i bariery przy boksach.
