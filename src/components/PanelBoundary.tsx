// Keeps one broken panel from taking the whole page down: if a panel throws while drawing,
// this shows a short message with "try again" in its place, and the rest of the app carries on.
// (React only offers this as a class component.)
import { Component, type ReactNode } from "react";

interface PanelBoundaryProps {
  /** What the panel is, for the message ("the bills"). */
  label: string;
  children: ReactNode;
}

export default class PanelBoundary extends Component<PanelBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`The ${this.props.label} panel failed to draw:`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="panel-error" role="alert">
        <h3>Something went wrong here</h3>
        <p>
          {`The ${this.props.label} couldn’t be shown. Nothing has been lost: your house is saved on the server.`}
        </p>
        <button className="add-chore-button" type="button" onClick={() => this.setState({ failed: false })}>
          TRY AGAIN
        </button>
      </div>
    );
  }
}
