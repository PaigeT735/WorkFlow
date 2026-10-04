import Home from "./Home";
import { Route, Switch } from "react-router-dom";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
    </Switch>
  );
}
