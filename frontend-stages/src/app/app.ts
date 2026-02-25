import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet], // Il est crucial qu'il n'y ait que RouterOutlet ici
  templateUrl: './app.html',
  // Laisse la ligne styleUrl telle qu'elle est générée chez toi
})
export class App {
  title = 'frontend-stages';
}