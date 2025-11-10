"""
MLflow tracking integration for experiment tracking and model registry.
"""

import os
from typing import Any, Dict, Optional

import mlflow
from app.config.logger import logger

# Configure MLflow tracking URI
MLFLOW_TRACKING_URI = os.getenv('MLFLOW_TRACKING_URI', 'http://localhost:5000')
mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)

logger.info(f'MLflow tracking URI: {MLFLOW_TRACKING_URI}')


class MLflowTracker:
    """
    Wrapper for MLflow tracking operations.

    Handles experiment creation, run management, logging parameters/metrics/artifacts,
    and model registration.
    """

    @staticmethod
    def create_or_get_experiment(user_id: str) -> str:
        """
        Create or get experiment for a specific user.

        Each user gets their own experiment for model isolation.

        Args:
            user_id: Unique user identifier

        Returns:
            Experiment ID
        """
        experiment_name = f'user_{user_id}_categorization'

        experiment = mlflow.get_experiment_by_name(experiment_name)
        if experiment is None:
            experiment_id = mlflow.create_experiment(
                experiment_name, tags={'user_id': user_id, 'model_type': 'categorization'}
            )
            logger.info(f'Created experiment: {experiment_name} (ID: {experiment_id})')
        else:
            experiment_id = experiment.experiment_id
            logger.debug(f'Using existing experiment: {experiment_name} (ID: {experiment_id})')

        return experiment_id

    @staticmethod
    def start_run(experiment_id: str, run_name: Optional[str] = None) -> mlflow.ActiveRun:
        """
        Start a new MLflow run within an experiment.

        Args:
            experiment_id: Experiment to log run under
            run_name: Optional name for the run

        Returns:
            Active MLflow run context
        """
        return mlflow.start_run(experiment_id=experiment_id, run_name=run_name)

    @staticmethod
    def log_params(params: Dict[str, Any]) -> None:
        """
        Log hyperparameters for the current run.

        Args:
            params: Dictionary of parameter names and values
        """
        mlflow.log_params(params)
        logger.debug(f'Logged parameters: {list(params.keys())}')

    @staticmethod
    def log_metrics(metrics: Dict[str, float], step: Optional[int] = None) -> None:
        """
        Log metrics for the current run.

        Args:
            metrics: Dictionary of metric names and values
            step: Optional step number for time-series metrics
        """
        mlflow.log_metrics(metrics, step=step)
        logger.debug(f'Logged metrics: {list(metrics.keys())}')

    @staticmethod
    def log_artifact(local_path: str, artifact_path: Optional[str] = None) -> None:
        """
        Log a file or directory as an artifact.

        Args:
            local_path: Path to local file or directory
            artifact_path: Optional subdirectory within run's artifact directory
        """
        mlflow.log_artifact(local_path, artifact_path)
        logger.debug(f'Logged artifact: {local_path}')

    @staticmethod
    def log_model(
        model: Any,
        artifact_path: str,
        registered_model_name: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        """
        Log model to MLflow.

        Args:
            model: Trained model object
            artifact_path: Path within run's artifact directory
            registered_model_name: Optional name for model registry
            **kwargs: Additional arguments for model logging (signature, input_example, etc.)
        """
        mlflow.sklearn.log_model(
            model, artifact_path, registered_model_name=registered_model_name, **kwargs
        )
        logger.info(
            f'Logged model to artifact_path={artifact_path}, '
            f'registered_name={registered_model_name}'
        )

    @staticmethod
    def load_model(model_uri: str) -> Any:
        """
        Load model from MLflow.

        Args:
            model_uri: URI to model (e.g., "models:/ModelName/Production")

        Returns:
            Loaded model object
        """
        model = mlflow.sklearn.load_model(model_uri)
        logger.info(f'Loaded model from: {model_uri}')
        return model

    @staticmethod
    def register_model(run_id: str, artifact_path: str, model_name: str) -> None:
        """
        Register a model from a run to the Model Registry.

        Args:
            run_id: MLflow run ID
            artifact_path: Path to model within run artifacts
            model_name: Name for registered model
        """
        model_uri = f'runs:/{run_id}/{artifact_path}'
        mlflow.register_model(model_uri, model_name)
        logger.info(f'Registered model: {model_name} from run {run_id}')

    @staticmethod
    def transition_model_stage(model_name: str, version: int, stage: str) -> None:
        """
        Transition a model version to a different stage.

        Args:
            model_name: Registered model name
            version: Model version number
            stage: Target stage ('Staging', 'Production', 'Archived')
        """
        client = mlflow.tracking.MlflowClient()
        client.transition_model_version_stage(model_name, version, stage)
        logger.info(f'Transitioned {model_name} v{version} to stage: {stage}')
