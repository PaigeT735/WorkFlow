import React from "react";
import agent from "./agent";

class Home extends React.Component {
  componentWillMount() {
    const articlesPromise = this.props.token ? agent.Articles.feed : agent.Articles.all;
    articlesPromise();
  }

  render() {
    return <h1>Home</h1>;
  }
}

function connect() {
  return (component) => component;
}

export default connect()(Home);
