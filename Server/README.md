# Signaling Server with Scaling Capabilities using Socket.io

This README file provides instructions for setting up a signaling server with scaling capabilities using Socket.io, along with HAProxy as a load balancer and multiple instances of the signaling server that communicate with each other using Redis and Redis Socket.io Adapter. The entire setup is achieved using Docker Compose.

## Prerequisites

Before setting up the signaling server, ensure that you have the following installed:

   * Docker
   * Docker Compose

## Configuration

1. Create Docker Image of the Signaling Server

    `docker build -t signaling .`

2. Make sure you are in the project directory.

3. Start the Docker containers using Docker Compose:

    `docker-compose up`

    This command will build the signaling server and Redis containers, as well as the load balancer. It will also link them together and expose the necessary ports.

4. Once the containers are up and running, you can access the signaling server through the load balancer at https://localhost:3000.


## Architecture Diagram

                                    +------------+
                                    |            |
                                    |   Clients  |
                                    |            |
                                    +------+-----+
                                           |
                                           |
                                    +------v-----+
                                    |  HAProxy   |
                                    +------+-----+
                                           |
                                           |
                        +-----------+------------+-----------+
                        |           |            |           |    
                    +----v----+ +----v----+ +----v----+ +----v----+
                    |  Sig1   | |  Sig2   | |  Sig3   | |  Sig4   |
                    |         | |         | |         | |         |
                    +----+----+ +----+----+ +----+----+ +----+----+
                        |           |            |           |
                        +-----------+------------+-----------+
                                           |
                                    +------v-----+
                                    |   Redis    |
                                    +------------+

## Explanation:

1. The architecture consists of multiple components: Clients, HAProxy, Redis, and multiple instances of the Signaling Server.

2. Clients are the end-users who connect to the signaling server for real-time communication.

3. HAProxy acts as a load balancer at Layer 4, distributing incoming client connections across the multiple instances of the Signaling Server to achieve scalability and handle increased traffic.

4. Redis is used as a distributed in-memory data store and message broker. It allows the signaling server instances to communicate and synchronize state using the Redis Pub/Sub mechanism.

5. Each Signaling Server instance (A, B, C, etc.) runs a containerized version of the signaling server image. These instances are connected to the Redis service and expose port 3000 to receive client connections.

6. The signaling server instances are independent and stateless. They can handle client connections and signaling logic without relying on a shared state. Redis Pub/Sub is used to synchronize any necessary state across instances.

7. The signaling server instances communicate with each other through the Redis service using the redis-socket.io adapter. This enables real-time messaging between instances and ensures that signaling messages are delivered to the appropriate recipients.

8. Docker Compose is used to define and manage the entire setup. Each component is defined as a service in the docker-compose.yml file, allowing easy deployment and scaling of the architecture.