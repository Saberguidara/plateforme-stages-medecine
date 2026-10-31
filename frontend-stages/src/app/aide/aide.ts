import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, ContactService } from '../services/api';
import { AuthService } from '../services/auth';

interface Question {
  question: string;
  reponse: string;
}

// Page publique : réponses aux questions fréquentes des résidents et coordonnées du service des stages.
@Component({
  selector: 'app-aide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './aide.html',
  styleUrls: ['./aide.css']
})
export class Aide implements OnInit {
  private api = inject(ApiService);
  readonly connecte = inject(AuthService).isResident();

  readonly contact = signal<ContactService | null>(null);
  readonly contactIndisponible = signal(false);

  readonly questions: Question[] = [
    {
      question: 'Comment me connecter ?',
      reponse: "Saisissez votre CIN (ou numéro de passeport) et l'adresse e-mail enregistrée par le service des stages. "
        + 'Vous recevez un code à 6 chiffres par e-mail, valable 10 minutes : saisissez-le pour ouvrir votre espace.'
    },
    {
      question: 'Je ne reçois pas le code de connexion.',
      reponse: 'Vérifiez votre dossier « courrier indésirable ». Vous pouvez demander un nouveau code après 2 minutes. '
        + "Si rien n'arrive, votre adresse e-mail n'est peut-être pas celle enregistrée : contactez le service des stages pour la vérifier ou la changer."
    },
    {
      question: "Ma fiche du semestre n'apparaît pas.",
      reponse: "Les fiches sont ajoutées par le service des stages une fois le registre des choix du semestre enregistré. "
        + "Si votre adresse e-mail est enregistrée, vous recevez un e-mail dès que votre fiche est disponible. "
        + "Passé ce délai, contactez le service des stages."
    },
    {
      question: 'Une information est fausse sur ma fiche.',
      reponse: "Dans votre espace, utilisez « Une information est fausse ? » (ou l'icône drapeau) sur la fiche concernée, "
        + 'et précisez ce qui est erroné. Le service des stages corrige la fiche ; vous voyez sa réponse sur la fiche et la recevez par e-mail.'
    },
    {
      question: 'Que signifie « Parcours terminé » ?',
      reponse: 'Votre résidanat est terminé : la dernière année est passée. Toutes vos fiches restent disponibles au téléchargement.'
    },
    {
      question: 'Quelle année est imprimée sur ma fiche ?',
      reponse: "L'année de résidanat est calculée à partir de votre promotion (année d'entrée en 1re année). "
        + "Si elle vous paraît fausse, signalez une erreur sur la fiche en choisissant « Autre »."
    }
  ];

  ngOnInit() {
    this.api.getContact().subscribe({
      next: (c) => this.contact.set(c),
      error: () => this.contactIndisponible.set(true)
    });
  }
}
