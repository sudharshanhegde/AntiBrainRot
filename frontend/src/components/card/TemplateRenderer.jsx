import { TextOnlyCard } from "./TextOnlyCard";
import { TextCodeCard } from "./TextCodeCard";
import { TextDiagramCard } from "./TextDiagramCard";
import { QuizCard } from "./QuizCard";

// Dispatches a card to its component. Concept cards go by their template
// tag that the content pipeline assigned during generation; quiz cards
// (SKILL_quiz.md) render the interactive QuizCard regardless of template.
export function TemplateRenderer({ card, accent }) {
  if (card.type === "quiz") {
    return <QuizCard card={card} accent={accent} />;
  }
  switch (card.template) {
    case "text_code":
      return (
        <TextCodeCard title={card.title} body={card.body} code={card.code_snippet} />
      );
    case "text_diagram":
      return (
        <TextDiagramCard
          title={card.title}
          body={card.body}
          diagramRef={card.diagram_ref}
          accent={accent}
        />
      );
    case "text_only":
    default:
      return <TextOnlyCard title={card.title} body={card.body} />;
  }
}
