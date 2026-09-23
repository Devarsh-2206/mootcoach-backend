# MOOTCOACH: COMPONENT LIBRARY INTERACTION PATTERNS

## Buttons
- **Primary CTAs:** Magnetic pull, spring release on click, dynamic hover lighting.
- **Secondary / Outlined:** Subtle border glow on hover.

## Cards
- **Perspective Cards:** Tilt on hover based on cursor position.
- **Content Reveal:** On hover, a faint light sweeps across the card, revealing previously dim metadata.

## Navigation
- **Transitions:** Smooth, sliding indicators.
- **Text Roll:** When clicking a nav item, the old text rolls up and fades out while the new text rolls up and fades in.

## Modals
- **Entrance:** Spatial expansion. The modal grows from the clicked element.
- **Background:** Progressive blur on the underlying application.

## Lists (e.g., Precedents, Arguments)
- **Entrance:** Staggered opacity and slight upward translation.
- **Hover Displacement:** Hovering over a list item slightly pushes adjacent items away (creating breathing room).

## Loading States
- **Avoid:** Generic spinners.
- **Use:** Contextual loading states. E.g., when analyzing a document, show glowing lines scanning the text. When generating an argument, show a skeletal tree structure building itself.
